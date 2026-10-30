import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { applyEffects, parseItemDie, readItemData } from "./catalog";
import type { InventoryItem } from "./character-import";
import { rollDie } from "./dice";
import { PROGRAMS_MAX, readPrograms } from "./programs";
import { normalizeUniverse } from "./universe";

/** Le jeton de l'appelant décide de l'accès (RLS) ; la clé de service écrit ensuite. */
async function access(supabase: SupabaseClient<Database>, userId: string, characterId: string) {
  const { data: character } = await supabase
    .from("characters")
    .select("id,team_id,owner_id,name,handle,sheet,players_can_edit")
    .eq("id", characterId)
    .maybeSingle();
  if (!character) throw new Error("Fiche introuvable.");
  const { data: isGm } = await supabase.rpc("is_gm");
  const gm = isGm === true;
  if (!gm && character.owner_id !== userId) throw new Error("Ce n’est pas ta fiche.");
  if (!gm && !character.players_can_edit) throw new Error("Fiche verrouillée par le MJ.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: state } = await supabaseAdmin
    .from("character_state")
    .select("hp_current,eddies,inventory,programs")
    .eq("character_id", characterId)
    .single();
  if (!state) throw new Error("Fiche introuvable.");
  return { admin: supabaseAdmin, character, state, gm };
}

const inventoryOf = (raw: unknown) => (Array.isArray(raw) ? (raw as InventoryItem[]) : []);

/** Achat par un joueur, ou don gratuit du MJ (`free`). */
export const acquireItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      characterId: z.string().uuid(),
      itemId: z.string().uuid(),
      free: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, character, state, gm } = await access(
      context.supabase,
      context.userId,
      data.characterId,
    );
    const { data: item } = await admin
      .from("catalog_items")
      .select("*")
      .eq("id", data.itemId)
      .eq("team_id", character.team_id)
      .maybeSingle();
    if (!item || (!gm && !item.in_shop)) throw new Error("Objet introuvable.");
    if (data.free && !gm) throw new Error("Seul le MJ donne un objet gratuitement.");
    const price = data.free ? 0 : item.price;
    if (state.eddies < price) throw new Error("Pas assez d’argent.");

    const details = readItemData(item.data);
    const update: Database["public"]["Tables"]["character_state"]["Update"] = {
      eddies: state.eddies - price,
    };
    if (item.kind === "weapon") {
      const sheet = (character.sheet ?? {}) as Record<string, unknown>;
      const weapons = Array.isArray(sheet["weapons"]) ? sheet["weapons"] : [];
      const { error } = await admin
        .from("characters")
        .update({
          sheet: {
            ...sheet,
            weapons: [
              ...weapons,
              {
                name: item.name,
                dmg: details.dmg,
                ammo: details.capacity ? String(details.capacity) : "",
                rof: details.rof,
                skill: details.skill,
              },
            ],
          } as Json,
        })
        .eq("id", character.id);
      if (error) throw new Error("Ajout impossible.");
    } else if (item.kind === "power") {
      const programs = readPrograms(state.programs);
      if (programs.length >= PROGRAMS_MAX) throw new Error("Plus de place pour un autre pouvoir.");
      update.programs = [
        ...programs,
        {
          id: crypto.randomUUID(),
          name: item.name,
          slots: details.slots,
          dice: details.die,
          effect: item.description.slice(0, 500),
          active: false,
        },
      ] as Json;
    } else {
      const list = inventoryOf(state.inventory);
      const owned = list.some((x) => x.item_id === item.id);
      update.inventory = (owned
        ? list.map((x) => (x.item_id === item.id ? { ...x, qty: x.qty + 1 } : x))
        : [
            ...list,
            {
              name: item.name,
              qty: 1,
              item_id: item.id,
              desc: item.description,
              usable: details.effects.length > 0,
            },
          ]) as unknown as Json;
    }
    const { error } = await admin
      .from("character_state")
      .update(update)
      .eq("character_id", character.id);
    if (error) throw new Error(error.message);
    return { name: item.name, price };
  });

/** Utilise un objet de l'inventaire : dé tiré ici, jamais dans le navigateur. */
export const consumeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ characterId: z.string().uuid(), itemId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { admin, character, state } = await access(
      context.supabase,
      context.userId,
      data.characterId,
    );
    const list = inventoryOf(state.inventory);
    const owned = list.find((x) => x.item_id === data.itemId);
    if (!owned || owned.qty < 1) throw new Error("Objet absent de l’inventaire.");
    const { data: item } = await admin
      .from("catalog_items")
      .select("*")
      .eq("id", data.itemId)
      .eq("team_id", character.team_id)
      .maybeSingle();
    if (!item) throw new Error("Cet objet n’existe plus dans le catalogue.");
    const details = readItemData(item.data);
    const { data: session } = await admin
      .from("session_state")
      .select("universe")
      .eq("team_id", character.team_id)
      .single();
    const universe = normalizeUniverse(session?.universe);

    const plan = parseItemDie(details.die);
    const results = plan ? Array.from({ length: plan.count }, () => rollDie(plan.sides)) : [];
    const total = plan ? results.reduce((a, b) => a + b, 0) + plan.mod : null;
    const after = applyEffects(
      {
        hp: state.hp_current,
        money: state.eddies,
        sheet: (character.sheet ?? {}) as Record<string, unknown>,
      },
      details.effects,
      total,
      universe,
    );

    const { error: sheetError } = await admin
      .from("characters")
      .update({ sheet: after.sheet as Json })
      .eq("id", character.id);
    if (sheetError) throw new Error("Utilisation impossible.");
    const inventory = list.flatMap((x) => {
      if (x.item_id !== data.itemId || item.kind !== "consumable") return [x];
      return x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : [];
    });
    const { error } = await admin
      .from("character_state")
      .update({
        hp_current: after.hp,
        eddies: after.money,
        inventory: inventory as unknown as Json,
      })
      .eq("character_id", character.id);
    if (error) throw new Error(error.message);

    if (plan && total !== null) {
      await admin.from("rolls").insert({
        team_id: character.team_id,
        user_id: context.userId,
        character_id: character.id,
        label: item.name,
        dice_count: plan.count,
        dice_sides: plan.sides,
        modifier: plan.mod,
        results,
        total,
        character_name: character.handle || character.name,
        display_name: character.handle || character.name,
      });
    }
    return { name: item.name, total, lines: after.lines };
  });
