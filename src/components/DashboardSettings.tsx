import { useState, type PointerEvent } from "react";
import { Eye, EyeOff, GripVertical, RotateCcw, Save, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DASHBOARD_SORTS,
  DEFAULT_PREFS,
  QUICK_VIEWS,
  applyQuickView,
  isQuickView,
  isSavedView,
  moveCharacter,
  moveSection,
  snapshotView,
  toggleIn,
  type DashboardPrefs,
  type DashboardRow,
  type DashboardSort,
} from "@/lib/dashboard";
import { hpMax, readStats, hpFill } from "@/lib/sheet";
import { useUniverse } from "@/lib/universe-context";

type Grab = (e: PointerEvent<HTMLElement>, id: string) => void;
const MAX_VIEWS = 12;

const arrow = (key: string) =>
  key === "ArrowUp" || key === "ArrowLeft"
    ? -1
    : key === "ArrowDown" || key === "ArrowRight"
      ? 1
      : 0;

function EyeToggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <Button
      className="custom-eye"
      aria-label={`Afficher ${label}`}
      aria-pressed={on}
      title={on ? "Masquer" : "Afficher"}
      onClick={onToggle}
    >
      {on ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
    </Button>
  );
}

/** Panneau Personnaliser : tout se voit en direct dans le tableau, juste à côté. */
export function DashboardSettings({
  rows,
  prefs,
  grabRow,
  grabSection,
  canUndo,
  onUndo,
  onChange,
  onClose,
}: {
  rows: DashboardRow[];
  prefs: DashboardPrefs;
  grabRow: Grab;
  grabSection: Grab;
  canUndo: boolean;
  onUndo: () => void;
  onChange: (next: DashboardPrefs) => void;
  onClose: () => void;
}) {
  const { universe: u } = useUniverse();
  const [viewName, setViewName] = useState("");
  const ids = rows.map((r) => r.id);
  const fields = [...u.rules.defenses, ...u.rules.gauges];
  const statKeys = u.rules.stats.map((s) => s.key);
  const manual = prefs.sort === "manual";

  function saveView() {
    const name = viewName.trim();
    if (!name || prefs.views.length >= MAX_VIEWS) return;
    onChange({
      ...prefs,
      views: [...prefs.views, { id: crypto.randomUUID(), name, snapshot: snapshotView(prefs) }],
    });
    setViewName("");
  }

  return (
    <aside className="customize" aria-label="Personnaliser le tableau de bord">
      <header className="customize-head">
        <h2>Personnaliser</h2>
        <Button
          aria-label="Annuler la dernière modification"
          title="Annuler"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={18} aria-hidden="true" />
        </Button>
        <Button aria-label="Fermer le panneau" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </Button>
      </header>
      <div className="customize-body">
        <section className="customize-group">
          <h3>Vues</h3>
          <div className="custom-chips">
            {QUICK_VIEWS.map((v) => (
              <Button
                key={v.key}
                aria-pressed={isQuickView(prefs, v.sections)}
                onClick={() => onChange(applyQuickView(prefs, v.sections))}
              >
                {v.label}
              </Button>
            ))}
            {prefs.views.map((v) => (
              <span className="custom-view" key={v.id}>
                <Button
                  aria-pressed={isSavedView(prefs, v)}
                  onClick={() => onChange({ ...prefs, ...v.snapshot })}
                >
                  {v.name}
                </Button>
                <Button
                  className="remove"
                  aria-label={`Supprimer la vue ${v.name}`}
                  onClick={() =>
                    onChange({ ...prefs, views: prefs.views.filter((x) => x.id !== v.id) })
                  }
                >
                  <X size={13} aria-hidden="true" />
                </Button>
              </span>
            ))}
          </div>
          <form
            className="custom-save"
            onSubmit={(e) => {
              e.preventDefault();
              saveView();
            }}
          >
            <input
              className="field"
              placeholder="Nom de la vue"
              aria-label="Nom de la vue à enregistrer"
              maxLength={24}
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
            />
            <Button
              type="submit"
              className="btn y"
              disabled={!viewName.trim() || prefs.views.length >= MAX_VIEWS}
            >
              <Save size={15} /> Garder
            </Button>
          </form>
        </section>

        <section className="customize-group">
          <h3>
            Fiches <small>glisse pour ranger</small>
          </h3>
          <select
            className="field"
            aria-label="Trier les fiches"
            value={prefs.sort}
            onChange={(e) => onChange({ ...prefs, sort: e.target.value as DashboardSort })}
          >
            {DASHBOARD_SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <ul className="custom-rows">
            {rows.map((r) => {
              const name = r.handle || r.name;
              const max = hpMax(readStats(r.sheet, u), r.sheet, u);
              const hp = r.character_state?.hp_current ?? 0;
              const shown = !prefs.hiddenCharacters.includes(r.id);
              return (
                <li key={r.id} data-order-row={r.id} className={shown ? "" : "off"}>
                  <Button
                    className="grip"
                    aria-label={`Déplacer ${name}`}
                    title="Glisse, ou utilise les flèches du clavier"
                    onPointerDown={(e) => grabRow(e, r.id)}
                    onKeyDown={(e) => {
                      const delta = arrow(e.key);
                      if (!delta) return;
                      e.preventDefault();
                      onChange({
                        ...prefs,
                        sort: "manual",
                        order: moveCharacter(manual ? prefs.order : ids, ids, r.id, delta),
                      });
                    }}
                  >
                    <GripVertical size={16} aria-hidden="true" />
                  </Button>
                  <span className="custom-name">
                    {name}
                    <i aria-hidden="true">
                      <b style={{ width: `${hpFill(hp, max) * 100}%` }} />
                    </i>
                  </span>
                  <EyeToggle
                    label={name}
                    on={shown}
                    onToggle={() =>
                      onChange({
                        ...prefs,
                        hiddenCharacters: toggleIn(prefs.hiddenCharacters, r.id),
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="customize-group">
          <h3>
            Sections <small>glisse pour ranger</small>
          </h3>
          <ul className="custom-rows">
            {prefs.sections.map((s) => (
              <li key={s.key} data-section-row={s.key} className={s.visible ? "" : "off"}>
                <Button
                  className="grip"
                  aria-label={`Déplacer la section ${s.key}`}
                  title="Glisse, ou utilise les flèches du clavier"
                  onPointerDown={(e) => grabSection(e, s.key)}
                  onKeyDown={(e) => {
                    const delta = arrow(e.key);
                    if (!delta) return;
                    e.preventDefault();
                    onChange({ ...prefs, sections: moveSection(prefs.sections, s.key, delta) });
                  }}
                >
                  <GripVertical size={16} aria-hidden="true" />
                </Button>
                <span className="custom-name">{s.key}</span>
                <EyeToggle
                  label={`la section ${s.key}`}
                  on={s.visible}
                  onToggle={() =>
                    onChange({
                      ...prefs,
                      sections: prefs.sections.map((x) =>
                        x.key === s.key ? { ...x, visible: !x.visible } : x,
                      ),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="customize-group">
          <h3>
            {u.words.stats}
            <span>
              <Button
                className="customize-link"
                onClick={() => onChange({ ...prefs, hiddenStats: [] })}
              >
                Tout
              </Button>
              <Button
                className="customize-link"
                onClick={() => onChange({ ...prefs, hiddenStats: statKeys })}
              >
                Aucune
              </Button>
            </span>
          </h3>
          <div className="custom-chips">
            {u.rules.stats.map((s) => (
              <Button
                key={s.key}
                aria-pressed={!prefs.hiddenStats.includes(s.key)}
                onClick={() =>
                  onChange({ ...prefs, hiddenStats: toggleIn(prefs.hiddenStats, s.key) })
                }
              >
                {s.label}
              </Button>
            ))}
          </div>
        </section>

        {fields.length > 0 && (
          <section className="customize-group">
            <h3>{u.words.vitals}</h3>
            <div className="custom-chips">
              {fields.map((f) => (
                <Button
                  key={f.key}
                  aria-pressed={!prefs.hiddenFields.includes(f.key)}
                  onClick={() =>
                    onChange({ ...prefs, hiddenFields: toggleIn(prefs.hiddenFields, f.key) })
                  }
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </section>
        )}

        <Button
          className="custom-reset"
          onClick={() => onChange({ ...DEFAULT_PREFS, views: prefs.views })}
        >
          <RotateCcw size={15} aria-hidden="true" /> Tout réinitialiser
        </Button>
      </div>
    </aside>
  );
}
