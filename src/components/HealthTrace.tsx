import { useState } from "react";

/*
 * Tracé ECG des signes vitaux — 4 états :
 *   stable   (> 50 % PV)   vert,  rythme calme et régulier
 *   blesse   (≤ 50 % PV)   jaune, rythme rapide, pics plus hauts
 *   critique (≤ 25 % PV)   rouge, rythme irrégulier, battement faible, clignote
 *   mourant  (≤ 0 PV)      rouge, ligne plate immobile
 *
 * Pourquoi ça ne "saute" plus :
 *  - L'animation CSS (.ecg svg) décale le SVG de 50 % = 480 unités (viewBox 960, width 200 %).
 *    Chaque motif mesure un diviseur EXACT de 480 → la fin de la boucle est identique au début.
 *  - Le décalage de départ (animation-delay négatif) est calé sur l'horloge : si React
 *    recrée l'élément (rechargement de données, changement d'onglet…), le tracé reprend
 *    exactement là où il en était au lieu de repartir de zéro.
 */

type Level = "stable" | "blesse" | "critique" | "mourant";

const LEVELS: Record<
  Exclude<Level, "mourant">,
  { beat: string; len: number; dur: number; color: string; label: string }
> = {
  // 120 unités → 4 battements par boucle de 4 s (60 bpm)
  stable: {
    beat: "l20 0 l5 -3 l5 3 l8 0 l3 5 l5 -23 l5 31 l4 -13 l14 0 q7 -10 14 0 l37 0 ",
    len: 120,
    dur: 4,
    color: "var(--green)",
    label: "Rythme régulier : stable",
  },
  // 80 unités → 6 battements par boucle de 2,4 s (150 bpm)
  blesse: {
    beat: "l8 0 l3 -3 l3 3 l4 0 l2 4 l4 -28 l4 36 l3 -12 l8 0 q5 -8 10 0 l31 0 ",
    len: 80,
    dur: 2.4,
    color: "var(--yellow)",
    label: "Rythme accéléré : gravement blessé",
  },
  // 160 unités → 3 motifs irréguliers (battement faible + battement fort + extrasystole) par boucle de 1,8 s
  critique: {
    beat: "l6 0 l3 6 l3 -18 l3 22 l3 -10 l22 0 l2 3 l4 -32 l4 38 l3 -9 l10 0 q4 -5 8 0 l11 0 l3 4 l3 -10 l3 6 l69 0 ",
    len: 160,
    dur: 1.8,
    color: "var(--red)",
    label: "Rythme irrégulier : état critique",
  },
};

function levelFor(hp: number, max: number): Level {
  if (hp <= 0) return "mourant";
  if (hp <= Math.ceil(max / 4)) return "critique";
  if (hp <= Math.ceil(max / 2)) return "blesse";
  return "stable";
}

export function HealthTrace({ hp, max }: { hp: number; max: number }) {
  const level = levelFor(hp, max);
  // Instant de création de l'élément, figé : les re-rendus ne modifient pas la phase
  const [mountedAt] = useState(() => Date.now() / 1000);

  if (level === "mourant") {
    return (
      <div className="ecg health-trace mourant" aria-label="Tracé plat : mortellement blessé">
        <svg
          viewBox="0 0 960 40"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ animation: "none", transform: "none", width: "100%" }}
        >
          <path
            d="M0 22 H960"
            style={{
              stroke: "var(--red)",
              filter: "drop-shadow(0 0 2px var(--red))",
              animation: "blink 1.6s steps(1) infinite",
            }}
          />
        </svg>
      </div>
    );
  }

  const cfg = LEVELS[level];
  // 960 visibles + 480 de décalage → au moins 1440 unités de tracé
  const d = "M0 22 " + cfg.beat.repeat(Math.ceil(1440 / cfg.len) + 1);
  // Phase calée sur l'horloge : si le composant est recréé, le tracé reprend au même endroit
  const delay = -(mountedAt % cfg.dur);

  return (
    <div className={`ecg health-trace ${level}`} aria-label={cfg.label}>
      <svg
        viewBox="0 0 960 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ animationDuration: `${cfg.dur}s`, animationDelay: `${delay}s` }}
      >
        <path
          d={d}
          style={{
            stroke: cfg.color,
            filter: `drop-shadow(0 0 ${level === "stable" ? 3 : 4}px ${cfg.color})`,
            animation: level === "critique" ? "blink 1.2s steps(1) infinite" : undefined,
          }}
        />
      </svg>
    </div>
  );
}
