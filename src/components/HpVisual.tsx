import { useId } from "react";
import { HealthTrace } from "@/components/HealthTrace";
import { fillRow, hpLevel, hpLevelColor, type HpVisualKey } from "@/lib/hp-visual";

const HEART =
  "M12 21s-7.5-4.6-10-9.3C.4 8.4 2.2 4.5 6 4.5c2.300 0 4.300 1.200 6 3.500 1.700-2.300 3.700-3.500 6-3.500 3.800 0 5.600 3.900 4 7.200C19.500 16.400 12 21 12 21z";
const DROP =
  "M12 2.500C12 2.500 4.500 11 4.500 15.500a7.500 7.500 0 0 0 15 0C19.500 11 12 2.500 12 2.500z";

/** Rangée d'icônes qui se vident une à une, de droite à gauche. */
function IconRow({
  path,
  hp,
  max,
  count,
}: {
  path: string;
  hp: number;
  max: number;
  count: number;
}) {
  const id = useId();
  const color = hpLevelColor(hpLevel(hp, max));
  return (
    <div className="hp-row">
      {fillRow(hp, max, count).map((part, i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <clipPath id={`${id}-${i}`}>
              <rect x="0" y="0" width={24 * part} height="24" />
            </clipPath>
          </defs>
          <path d={path} fill="none" stroke="var(--mute)" strokeWidth="1.2" />
          <path d={path} fill={color} clipPath={`url(#${id}-${i})`} />
        </svg>
      ))}
    </div>
  );
}

function Segments({ hp, max }: { hp: number; max: number }) {
  const color = hpLevelColor(hpLevel(hp, max));
  return (
    <div className="hp-segments">
      {fillRow(hp, max, 20).map((part, i) => (
        <i
          key={i}
          style={part > 0 ? { background: color, opacity: 0.35 + part * 0.65 } : undefined}
        />
      ))}
    </div>
  );
}

function Flask({ hp, max }: { hp: number; max: number }) {
  const id = useId();
  const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const color = hpLevelColor(hpLevel(hp, max));
  const shape = "M20 3h12v3h-2v13l13 24c2 4 0 8-5 8H14c-5 0-7-4-5-8l13-24V6h-2z";
  const top = 51 - 36 * ratio;
  return (
    <svg className="hp-single" viewBox="0 0 52 54" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d={shape} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect x="0" y={top} width="52" height={54 - top} fill={color} opacity="0.85" />
      </g>
      <path d={shape} fill="none" stroke="var(--text)" strokeWidth="1.6" />
    </svg>
  );
}

function Shield({ hp, max }: { hp: number; max: number }) {
  const level = hpLevel(hp, max);
  const color = hpLevelColor(level);
  const shape = "M26 3l20 7v15c0 13-9 22-20 26C15 47 6 38 6 25V10z";
  return (
    <svg className="hp-single" viewBox="0 0 52 54" aria-hidden="true">
      <path
        d={shape}
        fill={color}
        fillOpacity={level === "mourant" ? 0.08 : 0.3}
        stroke={color}
        strokeWidth="2"
      />
      {level !== "stable" && (
        <path d="M26 3l-4 12 7 8-6 10 4 8" fill="none" stroke="var(--text)" strokeWidth="1.5" />
      )}
      {(level === "critique" || level === "mourant") && (
        <path
          d="M46 16l-11 5-3 9 7 7M6 22l10 3 5 9-6 7"
          fill="none"
          stroke="var(--text)"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

function Candle({ hp, max }: { hp: number; max: number }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const height = 8 + 34 * ratio;
  const top = 50 - height;
  return (
    <svg className="hp-single" viewBox="0 0 52 54" aria-hidden="true">
      <rect x="10" y="50" width="32" height="3" rx="1.500" fill="var(--mute)" />
      <rect x="19" y={top} width="14" height={height} rx="2" fill="var(--text)" opacity="0.85" />
      <path d={`M26 ${top}v-4`} stroke="var(--mute)" strokeWidth="1.2" />
      {hp > 0 && (
        <path
          className="hp-flame"
          d={`M26 ${top - 12}c4 4 5 6 3 9a4 4 0 0 1-6 0c-2-3-1-5 3-9z`}
          fill={hpLevelColor(hpLevel(hp, max))}
        />
      )}
    </svg>
  );
}

/** Affiche la santé dans le style choisi par le MJ. Le visuel ne décide jamais de l'état. */
export function HpVisual({ style, hp, max }: { style: HpVisualKey; hp: number; max: number }) {
  if (style === "none") return null;
  if (style === "ecg") return <HealthTrace hp={hp} max={max} />;
  const label = `${hp} sur ${max}`;
  return (
    <div className={`hp-visual hp-${style}`} role="img" aria-label={label}>
      {style === "bar" && <Segments hp={hp} max={max} />}
      {style === "hearts" && <IconRow path={HEART} hp={hp} max={max} count={5} />}
      {style === "blood" && <IconRow path={DROP} hp={hp} max={max} count={5} />}
      {style === "flask" && <Flask hp={hp} max={max} />}
      {style === "shield" && <Shield hp={hp} max={max} />}
      {style === "candle" && <Candle hp={hp} max={max} />}
    </div>
  );
}
