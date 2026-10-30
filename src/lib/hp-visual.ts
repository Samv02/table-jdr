/** Visuels de santé proposés aux MJ : fixes, chacun conseillé pour certains thèmes. */
export const HP_VISUALS = [
  { key: "ecg", label: "Tracé cardiaque", themes: ["cyberpunk"] },
  { key: "bar", label: "Barre segmentée", themes: ["neutre", "cyberpunk"] },
  { key: "hearts", label: "Cœurs", themes: ["neutre", "fantasy"] },
  { key: "flask", label: "Fiole", themes: ["fantasy"] },
  { key: "shield", label: "Bouclier fissuré", themes: ["fantasy", "grimdark"] },
  { key: "blood", label: "Gouttes de sang", themes: ["grimdark", "horreur"] },
  { key: "candle", label: "Bougie", themes: ["horreur"] },
  { key: "none", label: "Aucun", themes: [] as string[] },
] as const;
export type HpVisualKey = (typeof HP_VISUALS)[number]["key"];

/** Les visuels conseillés pour le thème passent devant ; « Aucun » reste à la fin. */
export function hpVisualsFor(preset: string) {
  const fits = (v: (typeof HP_VISUALS)[number]) => (v.themes as readonly string[]).includes(preset);
  return [...HP_VISUALS]
    .sort((a, b) => Number(b.key !== "none") - Number(a.key !== "none") || Number(fits(b)) - Number(fits(a)))
    .map((v) => ({ key: v.key, label: v.label, recommended: fits(v) }));
}

export type HpLevel = "stable" | "blesse" | "critique" | "mourant";

/** État visuel de la santé : la seule règle, partagée par tous les visuels. */
export function hpLevel(hp: number, max: number): HpLevel {
  if (hp <= 0) return "mourant";
  if (hp <= Math.ceil(max / 4)) return "critique";
  if (hp <= Math.ceil(max / 2)) return "blesse";
  return "stable";
}

export const hpLevelColor = (level: HpLevel) =>
  level === "stable" ? "var(--green)" : level === "blesse" ? "var(--yellow)" : "var(--red)";

/** Part remplie (0 à 1) de chaque élément d'une rangée, ex. 2,5 cœurs sur 5 : 1, 1, 0.5, 0, 0. */
export function fillRow(hp: number, max: number, count: number) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  return Array.from({ length: count }, (_, i) =>
    Math.max(0, Math.min(1, ratio * count - i)),
  );
}
