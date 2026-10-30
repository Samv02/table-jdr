import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DASHBOARD_SORTS,
  DEFAULT_PREFS,
  moveCharacter,
  moveSection,
  toggleIn,
  type DashboardPrefs,
  type DashboardRow,
  type DashboardSort,
} from "@/lib/dashboard";
import { useUniverse } from "@/lib/universe-context";

/** Panneau « Organiser » : tout ce que le MJ choisit d'afficher, et dans quel ordre. */
export function DashboardSettings({
  rows,
  prefs,
  onChange,
}: {
  rows: DashboardRow[];
  prefs: DashboardPrefs;
  onChange: (next: DashboardPrefs) => void;
}) {
  const { universe: u } = useUniverse();
  const ids = rows.map((r) => r.id);
  const fields = [...u.rules.defenses, ...u.rules.gauges];

  return (
    <section className="dashboard-settings" aria-label="Organiser le tableau de bord">
      <div>
        <h3>Ordre des fiches</h3>
        <label className="ds-sort">
          Trier par
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
        </label>
        <ul className="ds-list">
          {rows.map((r, i) => (
            <li key={r.id}>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Afficher ${r.handle || r.name}`}
                  checked={!prefs.hiddenCharacters.includes(r.id)}
                  onChange={() =>
                    onChange({
                      ...prefs,
                      hiddenCharacters: toggleIn(prefs.hiddenCharacters, r.id),
                    })
                  }
                />
                {r.handle || r.name}
              </label>
              <Button
                variant="prototype"
                className="icon-btn cut-s"
                aria-label={`Monter ${r.handle || r.name}`}
                disabled={prefs.sort !== "manual" || i === 0}
                onClick={() =>
                  onChange({ ...prefs, order: moveCharacter(prefs.order, ids, r.id, -1) })
                }
              >
                <ArrowUp />
              </Button>
              <Button
                variant="prototype"
                className="icon-btn cut-s"
                aria-label={`Descendre ${r.handle || r.name}`}
                disabled={prefs.sort !== "manual" || i === rows.length - 1}
                onClick={() =>
                  onChange({ ...prefs, order: moveCharacter(prefs.order, ids, r.id, 1) })
                }
              >
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3>Sections</h3>
        <ul className="ds-list">
          {prefs.sections.map((s, i) => (
            <li key={s.key}>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Afficher la section ${s.key}`}
                  checked={s.visible}
                  onChange={() =>
                    onChange({
                      ...prefs,
                      sections: prefs.sections.map((x) =>
                        x.key === s.key ? { ...x, visible: !x.visible } : x,
                      ),
                    })
                  }
                />
                {s.key}
              </label>
              <Button
                variant="prototype"
                className="icon-btn cut-s"
                aria-label={`Monter la section ${s.key}`}
                disabled={i === 0}
                onClick={() =>
                  onChange({ ...prefs, sections: moveSection(prefs.sections, s.key, -1) })
                }
              >
                <ArrowUp />
              </Button>
              <Button
                variant="prototype"
                className="icon-btn cut-s"
                aria-label={`Descendre la section ${s.key}`}
                disabled={i === prefs.sections.length - 1}
                onClick={() =>
                  onChange({ ...prefs, sections: moveSection(prefs.sections, s.key, 1) })
                }
              >
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3>{u.words.stats} affichées</h3>
        <div className="ds-checks">
          {u.rules.stats.map((s) => (
            <label key={s.key}>
              <input
                type="checkbox"
                aria-label={`Afficher ${s.label}`}
                checked={!prefs.hiddenStats.includes(s.key)}
                onChange={() =>
                  onChange({ ...prefs, hiddenStats: toggleIn(prefs.hiddenStats, s.key) })
                }
              />
              {s.label}
            </label>
          ))}
        </div>
        {fields.length > 0 && (
          <>
            <h3>{u.words.vitals} affichés</h3>
            <div className="ds-checks">
              {fields.map((f) => (
                <label key={f.key}>
                  <input
                    type="checkbox"
                    aria-label={`Afficher ${f.label}`}
                    checked={!prefs.hiddenFields.includes(f.key)}
                    onChange={() =>
                      onChange({ ...prefs, hiddenFields: toggleIn(prefs.hiddenFields, f.key) })
                    }
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </>
        )}
        <Button
          variant="prototype"
          className="btn ds-reset"
          onClick={() => onChange(DEFAULT_PREFS)}
        >
          <RotateCcw size={15} /> Tout réinitialiser
        </Button>
      </div>
    </section>
  );
}
