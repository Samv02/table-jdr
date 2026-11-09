/**
 * Panneau des réglages de l'outil en main : un titre, des sections nommées, des choix en
 * vignettes avec leur dessin, des curseurs avec leur valeur écrite. Pensé pour qu'on comprenne
 * sans connaître l'outil : le choix courant s'explique sous les vignettes.
 */
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOV_PRESETS, RANGE_MAX, SPEEDS, directionName, normDeg, type Cone } from "@/lib/map-cones";

export function Inspector({
  icon: Icon,
  title,
  collapsed,
  onCollapse,
  style,
  children,
}: {
  icon: LucideIcon;
  title: string;
  collapsed: boolean;
  onCollapse: () => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <aside
      className={`map-inspector ${collapsed ? "collapsed" : ""}`}
      aria-label={`Réglages : ${title}`}
      style={style}
    >
      <Button
        className="map-inspector-head"
        aria-expanded={!collapsed}
        title={collapsed ? "Afficher les réglages" : "Replier les réglages"}
        onClick={onCollapse}
      >
        <span className="map-inspector-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <b>{title}</b>
        <ChevronDown size={16} aria-hidden="true" className="map-inspector-chevron" />
      </Button>
      {!collapsed && <div className="map-inspector-body">{children}</div>}
    </aside>
  );
}

export function Section({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <section className="map-insp-sec">
      <h4>{label}</h4>
      {children}
      {hint && <p className="map-insp-hint">{hint}</p>}
    </section>
  );
}

export type TileOption<T> = { value: T; label: string; icon?: ReactNode; hint?: string };

/** Choix en vignettes : un dessin et un nom ; l'explication du choix courant en dessous. */
export function Tiles<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  cols = 3,
  compact = false,
}: {
  label: string;
  value: T;
  options: TileOption<T>[];
  onChange: (v: T) => void;
  cols?: number;
  /** Une seule rangée, dessins à gauche du nom */
  compact?: boolean;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Section label={label} hint={current?.hint}>
      <div
        className={`map-tiles ${compact ? "compact" : ""}`}
        role="radiogroup"
        aria-label={label}
        style={{ ["--cols" as string]: cols }}
      >
        {options.map((o) => (
          <Button
            key={String(o.value)}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.icon && (
              <span className="map-tile-art" aria-hidden="true">
                {o.icon}
              </span>
            )}
            <span>{o.label}</span>
          </Button>
        ))}
      </div>
    </Section>
  );
}

/** Curseur avec sa valeur écrite en clair. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <section className="map-insp-sec">
      <h4>
        {label}
        <output>{format(value)}</output>
      </h4>
      <input
        className="map-slider"
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--fill" as string]: `${((value - min) / (max - min || 1)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </section>
  );
}

/** Moins / valeur / plus. */
export function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
}: {
  label: string;
  value: ReactNode;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
}) {
  return (
    <section className="map-insp-sec">
      <h4>{label}</h4>
      <div className="map-stepper" role="group" aria-label={label}>
        <Button aria-label={minusLabel} title={minusLabel} onClick={onMinus}>
          −
        </Button>
        <output>{value}</output>
        <Button aria-label={plusLabel} title={plusLabel} onClick={onPlus}>
          +
        </Button>
      </div>
    </section>
  );
}

/** Rangée de boutons d'action, chacun avec son icône et son nom. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="map-insp-actions">{children}</div>;
}

// ---- Petits dessins des choix

function Box({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {children}
    </svg>
  );
}
/** Coins d'un rectangle, du plus vif au plus rond. */
export function CornerArt({ r }: { r: number }) {
  return (
    <Box>
      <rect x="3" y="5" width="18" height="14" rx={Math.min(7, r * 3.5)} />
    </Box>
  );
}
/** Polygone régulier à n côtés (0 : cercle). */
export function SidesArt({ n }: { n: number }) {
  if (!n)
    return (
      <Box>
        <circle cx="12" cy="12" r="8" />
      </Box>
    );
  const pts = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${(12 + 8.5 * Math.cos(a)).toFixed(1)},${(12.5 + 8.5 * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return (
    <Box>
      <polygon points={pts} strokeLinejoin="round" />
    </Box>
  );
}
/** Épaisseur d'un couloir. */
export function WidthArt({ w }: { w: number }) {
  return (
    <Box>
      <line x1="3" y1="12" x2="21" y2="12" strokeWidth={w * 2.2} strokeLinecap="round" />
    </Box>
  );
}
export function LineArt({ curve }: { curve: boolean }) {
  return (
    <Box>
      {curve ? (
        <path d="M3 18 C 7 2, 13 24, 21 6" strokeLinecap="round" />
      ) : (
        <polyline points="3,18 9,8 15,16 21,6" strokeLinejoin="round" />
      )}
    </Box>
  );
}
/** Taille d'un pinceau, en cases. */
export function DotArt({ n }: { n: number }) {
  return (
    <Box>
      <circle cx="12" cy="12" r={Math.min(10, 2 + n * 1.6)} fill="currentColor" stroke="none" />
    </Box>
  );
}
/** Pastille de couleur d'une matière. */
export function Swatch({ color }: { color: string }) {
  return <i className="map-swatch" style={{ ["--sw" as string]: color }} />;
}

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/** Réglages d'un champ de vision : direction, ouverture, portée, balayage, visible ou non. */
export function ConeControls({
  cone: c,
  dir,
  onCone,
  onDir,
  cellValue,
  cellUnit,
}: {
  cone: Cone;
  dir: number;
  onCone: (patch: Partial<Cone>) => void;
  onDir: (deg: number) => void;
  cellValue: number;
  cellUnit: string;
}) {
  const reach = (cells: number) =>
    `${(cells * cellValue).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${cellUnit}`;
  return (
    <>
      {c.fov < 360 && (
        <section className="map-insp-sec">
          <h4>
            Regarde vers
            <output>
              {directionName(dir)} · {Math.round(normDeg(dir))}°
            </output>
          </h4>
          <div className="map-compass" role="group" aria-label="Direction">
            {ARROWS.map((a, i) => (
              <Button
                key={a}
                aria-label={directionName(i * 45)}
                aria-pressed={Math.round(normDeg(dir)) === i * 45}
                onClick={() => onDir(i * 45)}
              >
                {a}
              </Button>
            ))}
          </div>
          <input
            className="map-slider"
            type="range"
            aria-label="Direction précise"
            min={0}
            max={355}
            step={5}
            value={Math.round(normDeg(dir) / 5) * 5}
            style={{ ["--fill" as string]: `${(normDeg(dir) / 355) * 100}%` }}
            onChange={(e) => onDir(Number(e.target.value))}
          />
        </section>
      )}
      <Tiles
        label="Ouverture"
        cols={4}
        value={FOV_PRESETS.some((p) => p.value === c.fov) ? c.fov : -1}
        options={FOV_PRESETS.map((p) => ({ value: p.value, label: p.label, hint: p.hint }))}
        onChange={(fov) => onCone({ fov })}
      />
      <Stepper
        label="Portée"
        value={reach(c.range)}
        minusLabel="Moins loin"
        plusLabel="Plus loin"
        onMinus={() => onCone({ range: Math.max(0.5, Math.round((c.range - 1) * 2) / 2) })}
        onPlus={() => onCone({ range: Math.min(RANGE_MAX, Math.round((c.range + 1) * 2) / 2) })}
      />
      {c.fov < 360 && (
        <Tiles
          label="Mouvement"
          cols={3}
          value={c.speed}
          options={SPEEDS}
          onChange={(speed) => onCone(speed && !c.sweep ? { speed, sweep: 35 } : { speed })}
        />
      )}
      {c.fov < 360 && c.speed > 0 && (
        <Slider
          label="Amplitude du balayage"
          value={c.sweep}
          min={5}
          max={90}
          step={5}
          format={(v) => `± ${v}°`}
          onChange={(sweep) => onCone({ sweep })}
        />
      )}
      <Tiles
        label="Les joueurs voient le cône ?"
        cols={2}
        compact
        value={c.show}
        options={[
          {
            value: true,
            label: "Visible",
            hint: "Les joueurs voient la zone surveillée et la voient rougir quand ils y entrent.",
          },
          {
            value: false,
            label: "Caché",
            hint: "Toi seul vois la zone (en pointillés). Pour un vrai secret, pose-la dans un calque caché.",
          },
        ]}
        onChange={(show) => onCone({ show })}
      />
    </>
  );
}
