import { Check, Eye, RotateCcw, Undo2 } from "lucide-react";
import {
  LAYOUT_PRESETS,
  applyLayout,
  isLayout,
  type DashboardPrefs,
  type DashboardRow,
  type LayoutPreset,
} from "@/lib/dashboard";

/** Miniature fidèle : autant de cases que de fiches, avec leurs largeurs. */
function LayoutThumb({ preset, count }: { preset: LayoutPreset; count: number }) {
  const columns = preset.columns || Math.max(count, 3);
  const cells = Math.min(Math.max(count, 3), 8);
  return (
    <span
      className="layout-thumb"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: cells }, (_, i) => (
        <i
          key={i}
          style={i === 0 && preset.lead > 1 ? { gridColumn: `span ${preset.lead}` } : undefined}
        />
      ))}
    </span>
  );
}

/** Dock du mode Disposition : dispositions toutes prêtes, densité, éléments masqués. */
export function DashboardLayoutDock({
  rows,
  ids,
  prefs,
  canUndo,
  onPreview,
  onChange,
  onUndo,
  onReset,
  onClose,
}: {
  rows: DashboardRow[];
  /** Fiches dans l'ordre affiché : la première devient la fiche mise en avant */
  ids: string[];
  prefs: DashboardPrefs;
  canUndo: boolean;
  onPreview: (next: Pick<DashboardPrefs, "columns" | "spans"> | null) => void;
  onChange: (next: DashboardPrefs) => void;
  onUndo: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const hiddenSections = prefs.sections.filter((s) => !s.visible);
  const hiddenRows = rows.filter((r) => prefs.hiddenCharacters.includes(r.id));

  return (
    <aside className="layout-dock" aria-label="Disposition du tableau de bord">
      <div className="layout-gallery" role="radiogroup" aria-label="Dispositions">
        {LAYOUT_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.key}
            role="radio"
            aria-checked={isLayout(prefs, preset, ids)}
            className={isLayout(prefs, preset, ids) ? "on" : ""}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") onPreview(applyLayout(prefs, preset, ids));
            }}
            onPointerLeave={() => onPreview(null)}
            onClick={() => {
              onPreview(null);
              onChange({ ...prefs, ...applyLayout(prefs, preset, ids) });
            }}
          >
            <LayoutThumb preset={preset} count={ids.length} />
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      <div className="layout-side">
        <div className="layout-density" role="radiogroup" aria-label="Densité">
          {(["comfort", "compact"] as const).map((density) => (
            <button
              type="button"
              key={density}
              role="radio"
              aria-checked={prefs.density === density}
              className={prefs.density === density ? "on" : ""}
              onClick={() => onChange({ ...prefs, density })}
            >
              {density === "comfort" ? "Confort" : "Compact"}
            </button>
          ))}
        </div>
        <div className="layout-actions">
          <button type="button" disabled={!canUndo} title="Ctrl+Z" onClick={onUndo}>
            <Undo2 size={16} aria-hidden="true" /> Annuler
          </button>
          <button type="button" onClick={onReset}>
            <RotateCcw size={16} aria-hidden="true" /> Réinitialiser
          </button>
          <button type="button" className="done" onClick={onClose}>
            <Check size={16} aria-hidden="true" /> Terminé
          </button>
        </div>
      </div>

      {(hiddenSections.length > 0 || hiddenRows.length > 0) && (
        <div className="layout-tray">
          <span>Masqués</span>
          {hiddenSections.map((s) => (
            <button
              type="button"
              key={s.key}
              aria-label={`Réafficher la section ${s.key}`}
              onClick={() =>
                onChange({
                  ...prefs,
                  sections: prefs.sections.map((x) =>
                    x.key === s.key ? { ...x, visible: true } : x,
                  ),
                })
              }
            >
              <Eye size={13} aria-hidden="true" /> {s.key}
            </button>
          ))}
          {hiddenRows.map((r) => (
            <button
              type="button"
              key={r.id}
              aria-label={`Réafficher ${r.handle || r.name}`}
              onClick={() =>
                onChange({
                  ...prefs,
                  hiddenCharacters: prefs.hiddenCharacters.filter((id) => id !== r.id),
                })
              }
            >
              <Eye size={13} aria-hidden="true" /> {r.handle || r.name}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
