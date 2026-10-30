import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rollDie, validateRoll, type RollInput } from "./dice";

// Server-side dice roll (anti-cheat): the browser cannot insert into "rolls".
export const rollDice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: RollInput) => {
    const clean: RollInput = {
      dice_count: Number(input.dice_count),
      dice_sides: Number(input.dice_sides),
      modifier: Number(input.modifier) || 0,
      label: input.label ? String(input.label).slice(0, 80) : null,
      is_secret: Boolean(input.is_secret),
      character_id: input.character_id ? String(input.character_id) : null,
      target:
        input.target == null || input.target === ("" as unknown) ? null : Number(input.target),
    };
    const err = validateRoll(clean);
    if (err) throw new Error(err);
    return clean;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, role")
      .eq("id", userId)
      .maybeSingle();
    const isGm = profile?.role === "gm";

    let characterName: string | null = null;
    if (data.character_id) {
      const { data: c } = await supabase
        .from("characters")
        .select("name, handle, owner_id")
        .eq("id", data.character_id)
        .maybeSingle();
      if (!c || c.owner_id !== userId) {
        throw new Error("Tu ne peux lancer les dés que pour ton propre personnage.");
      }
      characterName = c.handle || c.name;
    } else if (!isGm) {
      throw new Error("Choisis ton personnage pour lancer les dés.");
    }
    const display_name = characterName ?? "MJ";

    const results = Array.from({ length: data.dice_count }, () => rollDie(data.dice_sides));
    const total = results.reduce((a, b) => a + b, 0) + data.modifier;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("rolls")
      .insert({
        ...data,
        user_id: userId,
        results,
        total,
        author_name: profile?.username ?? null,
        character_name: characterName,
        display_name,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
