import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Gift, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";
import { useCatalog } from "@/components/CatalogManager";
import { acquireItem } from "@/lib/catalog.functions";
import { ITEM_KINDS, describeEffects, type CatalogItem } from "@/lib/catalog";
import { useUniverse } from "@/lib/universe-context";

/** Boutique de la fiche : le joueur achète, le MJ peut aussi donner, y compris ce qui est caché. */
export function ShopPanel({
  characterId,
  money,
  isGm,
  canEdit,
}: {
  characterId: string;
  money: number;
  isGm: boolean;
  canEdit: boolean;
}) {
  const { universe: u } = useUniverse();
  const { items } = useCatalog();
  const acquire = useServerFn(acquireItem);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category || labelOf(i)))].sort(),
    [items],
  );
  const shown = items.filter((i) => !category || (i.category || labelOf(i)) === category);

  async function get(item: CatalogItem, free: boolean) {
    if (!free && item.price > 0) {
      const ok = await confirmAction({
        title: `Acheter « ${item.name} » ?`,
        message: `${item.price} ${u.words.moneySymbol} seront retirés.`,
        confirmLabel: "Acheter",
      });
      if (!ok) return;
    }
    setBusy(true);
    setInfo(null);
    try {
      await acquire({ data: { characterId, itemId: item.id, free } });
      setInfo(`${item.name} ajouté à la fiche.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return null;
  return (
    <section className="panel cut shop">
      <div className="ph">
        <h2>{u.words.shop}</h2>
        {u.modules.money && (
          <span className="tag">
            {money} {u.words.moneySymbol}
          </span>
        )}
      </div>
      <InlineError message={err} onClear={() => setErr(null)} />
      {info && <p className="note">{info}</p>}
      {categories.length > 1 && (
        <select
          className="field"
          aria-label="Catégorie"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Tout</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      <ul className="shop-list">
        {shown.map((item) => (
          <li key={item.id}>
            <span className="catalog-name">
              <b>
                {item.name}
                {!item.in_shop && <em> (caché)</em>}
              </b>
              {item.description && <small>{item.description}</small>}
              <small>
                {[
                  item.kind === "weapon" ? item.data.dmg : "",
                  item.kind === "power" ? item.data.die : "",
                  describeEffects(item.data, u),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <span className="catalog-price">
              {item.price} {u.words.moneySymbol}
            </span>
            {item.in_shop && (
              <Button
                className="btn y"
                aria-label={`Acheter ${item.name}`}
                disabled={busy || !canEdit || money < item.price}
                onClick={() => void get(item, false)}
              >
                <ShoppingCart size={14} />
              </Button>
            )}
            {isGm && (
              <Button
                className="btn"
                aria-label={`Donner ${item.name}`}
                title="Donner gratuitement"
                disabled={busy}
                onClick={() => void get(item, true)}
              >
                <Gift size={14} />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const labelOf = (item: CatalogItem) =>
  ITEM_KINDS.find((k) => k.key === item.kind)?.label ?? item.kind;
