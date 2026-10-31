import { useCallback, useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";
import { useUniverse } from "@/lib/universe-context";
import {
  EMPTY_DATA,
  ITEM_KINDS,
  describeEffects,
  effectTargets,
  itemErrors,
  readItemData,
  type CatalogItem,
  type ItemData,
  type ItemKind,
} from "@/lib/catalog";

type Draft = Omit<CatalogItem, "id"> & { id: string | null };
const NEW_ITEM: Draft = {
  id: null,
  kind: "consumable",
  category: "",
  name: "",
  description: "",
  price: 0,
  in_shop: true,
  data: EMPTY_DATA,
};

export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("catalog_items").select("*").order("name");
    setItems((data ?? []).map((row) => ({ ...row, data: readItemData(row.data) })));
  }, []);
  useEffect(() => void load(), [load]);
  return { items, load };
}

/** Tout ce que le MJ prépare à l'avance. Enregistré tout de suite, objet par objet. */
export function CatalogManager() {
  const { universe: u } = useUniverse();
  const { items, load } = useCatalog();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kind, setKind] = useState<string>("all");
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!draft) return;
    const invalid = itemErrors(draft.name, draft.data);
    if (invalid) return setErr(invalid);
    const row = {
      kind: draft.kind,
      category: draft.category.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      price: Math.max(0, Math.round(draft.price) || 0),
      in_shop: draft.in_shop,
      data: draft.data as unknown as Json,
    };
    const { error } = draft.id
      ? await supabase.from("catalog_items").update(row).eq("id", draft.id)
      : await supabase.from("catalog_items").insert(row);
    if (error) return setErr(error.message);
    setDraft(null);
    await load();
  }
  async function remove(item: CatalogItem) {
    const ok = await confirmAction({
      title: `Supprimer « ${item.name} » du catalogue ?`,
      message: "Les objets déjà possédés restent sur les fiches, mais ne pourront plus s’utiliser.",
    });
    if (!ok) return;
    const { error } = await supabase.from("catalog_items").delete().eq("id", item.id);
    if (error) return setErr(error.message);
    await load();
  }
  async function toggleShop(item: CatalogItem) {
    const { error } = await supabase
      .from("catalog_items")
      .update({ in_shop: !item.in_shop })
      .eq("id", item.id);
    if (error) return setErr(error.message);
    await load();
  }

  const shown = items.filter((i) => kind === "all" || i.kind === kind);
  const patch = (next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next } : d));
  const patchData = (next: Partial<ItemData>) =>
    setDraft((d) => (d ? { ...d, data: { ...d.data, ...next } } : d));

  return (
    <div className="catalog">
      <p className="note">
        Enregistré tout de suite, objet par objet. Ce qui est caché reste invisible des joueurs.
      </p>
      <InlineError message={err} onClear={() => setErr(null)} />
      <div className="catalog-tools">
        <select
          className="field"
          aria-label="Filtrer le catalogue"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">Tout ({items.length})</option>
          {ITEM_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label} ({items.filter((i) => i.kind === k.key).length})
            </option>
          ))}
        </select>
        <Button className="btn y" onClick={() => setDraft({ ...NEW_ITEM })}>
          <Plus size={16} /> Nouvel objet
        </Button>
      </div>

      {draft && (
        <div className="catalog-form">
          <div className="catalog-grid">
            <label>
              Nom
              <input
                className="field"
                aria-label="Nom de l’objet"
                maxLength={60}
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label>
              Type
              <select
                className="field"
                aria-label="Type d’objet"
                value={draft.kind}
                onChange={(e) => patch({ kind: e.target.value as ItemKind })}
              >
                {ITEM_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Catégorie (libre)
              <input
                className="field"
                placeholder="Potion, Fusil, Sort de feu…"
                maxLength={40}
                value={draft.category}
                onChange={(e) => patch({ category: e.target.value })}
              />
            </label>
            <label>
              Prix ({u.words.moneySymbol})
              <input
                className="field"
                type="number"
                min={0}
                aria-label="Prix"
                value={draft.price}
                onChange={(e) => patch({ price: Number(e.target.value) })}
              />
            </label>
          </div>
          <label>
            Description
            <textarea
              className="field"
              rows={2}
              maxLength={1000}
              aria-label="Description de l’objet"
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>

          {draft.kind === "weapon" && (
            <div className="catalog-grid">
              <label>
                {u.words.damage}
                <input
                  className="field"
                  placeholder="2d6+1"
                  aria-label="Dégâts"
                  maxLength={30}
                  value={draft.data.dmg}
                  onChange={(e) => patchData({ dmg: e.target.value })}
                />
              </label>
              <label>
                {u.words.magazine}
                <input
                  className="field"
                  type="number"
                  min={0}
                  aria-label="Capacité"
                  value={draft.data.capacity}
                  onChange={(e) => patchData({ capacity: Number(e.target.value) })}
                />
              </label>
              <label>
                {u.words.rof}
                <input
                  className="field"
                  type="number"
                  min={1}
                  aria-label="Cadence"
                  value={draft.data.rof}
                  onChange={(e) => patchData({ rof: Number(e.target.value) })}
                />
              </label>
              <label>
                Compétence
                <input
                  className="field"
                  maxLength={60}
                  aria-label="Compétence de l’arme"
                  value={draft.data.skill}
                  onChange={(e) => patchData({ skill: e.target.value })}
                />
              </label>
            </div>
          )}

          {draft.kind === "power" && (
            <div className="catalog-grid">
              <label>
                {u.words.slotUnit}
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={10}
                  aria-label="Coût en emplacements"
                  value={draft.data.slots}
                  onChange={(e) => patchData({ slots: Number(e.target.value) })}
                />
              </label>
              <label>
                Dé
                <input
                  className="field"
                  placeholder="1d6"
                  aria-label="Dé du pouvoir"
                  maxLength={12}
                  value={draft.data.die}
                  onChange={(e) => patchData({ die: e.target.value })}
                />
              </label>
            </div>
          )}

          {(draft.kind === "consumable" || draft.kind === "gear") && (
            <>
              <label>
                Dé à l’utilisation (facultatif)
                <input
                  className="field"
                  placeholder="2d6+1"
                  aria-label="Dé de l’objet"
                  maxLength={12}
                  value={draft.data.die}
                  onChange={(e) => patchData({ die: e.target.value })}
                />
              </label>
              <div className="catalog-effects">
                <span>Effets quand on l’utilise</span>
                {draft.data.effects.map((e, i) => (
                  <div className="catalog-effect" key={i}>
                    <select
                      className="field"
                      aria-label={`Cible de l’effet ${i + 1}`}
                      value={e.target}
                      onChange={(ev) =>
                        patchData({
                          effects: draft.data.effects.map((x, j) =>
                            j === i ? { ...x, target: ev.target.value } : x,
                          ),
                        })
                      }
                    >
                      {effectTargets(u).map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="field"
                      aria-label={`Valeur de l’effet ${i + 1}`}
                      value={e.useDie ? (e.amount < 0 ? "minus" : "plus") : "fixed"}
                      onChange={(ev) =>
                        patchData({
                          effects: draft.data.effects.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  useDie: ev.target.value !== "fixed",
                                  amount:
                                    ev.target.value === "minus" ? -1 : Math.abs(x.amount) || 1,
                                }
                              : x,
                          ),
                        })
                      }
                    >
                      <option value="fixed">Valeur fixe</option>
                      <option value="plus">+ le dé</option>
                      <option value="minus">− le dé</option>
                    </select>
                    {!e.useDie && (
                      <input
                        className="field"
                        type="number"
                        aria-label={`Montant de l’effet ${i + 1}`}
                        value={e.amount}
                        onChange={(ev) =>
                          patchData({
                            effects: draft.data.effects.map((x, j) =>
                              j === i ? { ...x, amount: Number(ev.target.value) } : x,
                            ),
                          })
                        }
                      />
                    )}
                    <Button
                      className="icon-btn cut-s"
                      aria-label={`Retirer l’effet ${i + 1}`}
                      onClick={() =>
                        patchData({ effects: draft.data.effects.filter((_, j) => j !== i) })
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <Button
                  className="btn"
                  onClick={() =>
                    patchData({
                      effects: [...draft.data.effects, { target: "hp", amount: 1, useDie: false }],
                    })
                  }
                >
                  Ajouter un effet
                </Button>
              </div>
            </>
          )}

          <label className="catalog-check">
            <input
              type="checkbox"
              checked={draft.in_shop}
              onChange={(e) => patch({ in_shop: e.target.checked })}
            />
            Visible en boutique (décoché : caché, seul le MJ peut le donner)
          </label>
          <div className="catalog-tools">
            <Button className="btn y" onClick={() => void save()}>
              Enregistrer l’objet
            </Button>
            <Button className="btn" onClick={() => setDraft(null)}>
              Fermer
            </Button>
          </div>
        </div>
      )}

      <ul className="catalog-list">
        {shown.length === 0 && <li className="note">Rien ici pour l’instant.</li>}
        {shown.map((item) => (
          <li key={item.id} className={item.in_shop ? "" : "hidden-item"}>
            <span className="catalog-name">
              <b>{item.name}</b>
              <small>
                {[
                  ITEM_KINDS.find((k) => k.key === item.kind)?.label,
                  item.category,
                  item.kind === "weapon" ? item.data.dmg : "",
                  describeEffects(item.data, u),
                  item.in_shop ? "" : "Caché",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <span className="catalog-price">
              {item.price} {u.words.moneySymbol}
            </span>
            <Button
              className="icon-btn cut-s"
              title={item.in_shop ? "Cacher" : "Montrer en boutique"}
              aria-label={`${item.in_shop ? "Cacher" : "Montrer"} ${item.name}`}
              onClick={() => void toggleShop(item)}
            >
              {item.in_shop ? <Eye /> : <EyeOff />}
            </Button>
            <Button
              className="icon-btn cut-s"
              title="Dupliquer"
              aria-label={`Dupliquer ${item.name}`}
              onClick={() => setDraft({ ...item, id: null, name: `${item.name} (copie)` })}
            >
              <Copy />
            </Button>
            <Button
              className="icon-btn cut-s"
              title="Modifier"
              aria-label={`Modifier ${item.name}`}
              onClick={() => setDraft({ ...item })}
            >
              <Pencil />
            </Button>
            <Button
              className="icon-btn cut-s"
              title="Supprimer"
              aria-label={`Supprimer ${item.name}`}
              onClick={() => void remove(item)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
