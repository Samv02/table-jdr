/**
 * Apparence d'une carte : un style de départ, puis les retouches du MJ.
 * Les couleurs sont des données de la carte (choisies par le MJ), jamais des règles de jeu.
 * Une couleur absente suit le thème de l'univers.
 */
export type MapLayer = "floor" | "water" | "lava" | "plants" | "road";
export const MAP_LAYERS: { id: MapLayer; label: string; hint: string }[] = [
  { id: "floor", label: "Sol", hint: "Salles et couloirs : leurs murs bloquent la vue." },
  { id: "water", label: "Eau", hint: "Lac, rivière, bassin. Ne bloque pas la vue." },
  { id: "lava", label: "Lave", hint: "Coulée, fosse ardente. Ne bloque pas la vue." },
  { id: "plants", label: "Végétation", hint: "Forêt, buissons, jardin. Ne bloque pas la vue." },
  { id: "road", label: "Route", hint: "Chemin, route, place pavée." },
];
export const TERRAINS = MAP_LAYERS.filter((l) => l.id !== "floor").map((l) => l.id) as Exclude<
  MapLayer,
  "floor"
>[];

export type StyleId = "theme" | "hatch" | "parchment" | "blueprint" | "solid" | "mono";

/** null : couleur du thème */
export type MapStyle = {
  preset: StyleId;
  floor: string | null;
  rock: string | null;
  wall: string | null;
  grid: string | null;
  /** Épaisseur des murs, en pixels pour une case de 40 */
  wallWidth: number;
  hatch: boolean;
  /** Largeur de la bande de hachures, en cases */
  hatchSize: number;
  shadow: boolean;
  /** Grille aussi hors des salles, pour tout le monde */
  gridOutside: boolean;
  water: string | null;
  lava: string | null;
  plants: string | null;
  road: string | null;
};

type Preset = Omit<MapStyle, "preset">;
const THEME: Preset = {
  floor: null,
  rock: null,
  wall: null,
  grid: null,
  wallWidth: 5,
  hatch: false,
  hatchSize: 0.75,
  shadow: false,
  gridOutside: false,
  water: null,
  lava: null,
  plants: null,
  road: null,
};
const NATURE = { water: "#4f8fc9", lava: "#e0531f", plants: "#5d8a45", road: "#a08867" };

export const MAP_STYLES: { id: StyleId; label: string; hint: string; value: Preset }[] = [
  {
    id: "theme",
    label: "Thème",
    hint: "Les couleurs de l’univers de la table.",
    value: THEME,
  },
  {
    id: "hatch",
    label: "Hachures",
    hint: "Murs noirs et hachures autour, le plan de donjon classique.",
    value: {
      ...THEME,
      ...NATURE,
      floor: "#ffffff",
      rock: "#ffffff",
      wall: "#111111",
      grid: "#b9b9b9",
      wallWidth: 6,
      hatch: true,
      shadow: true,
    },
  },
  {
    id: "parchment",
    label: "Parchemin",
    hint: "Tons de vieux papier et murs bruns.",
    value: {
      ...THEME,
      floor: "#f3e6c4",
      rock: "#dcc796",
      wall: "#5c3b1e",
      grid: "#bfa574",
      wallWidth: 5,
      hatch: true,
      hatchSize: 0.6,
      shadow: true,
      water: "#6f9cae",
      lava: "#c4532a",
      plants: "#7d8b4a",
      road: "#b39466",
    },
  },
  {
    id: "blueprint",
    label: "Plan bleu",
    hint: "Roche bleue et salles blanches, façon vieux modules.",
    value: {
      ...THEME,
      ...NATURE,
      floor: "#f7f9fc",
      rock: "#2f6db5",
      wall: "#2f6db5",
      grid: "#8fb1dd",
      wallWidth: 4,
      gridOutside: true,
    },
  },
  {
    id: "solid",
    label: "Murs pleins",
    hint: "Murs épais et sombres, pour les bâtiments.",
    value: {
      ...THEME,
      ...NATURE,
      floor: "#d9d4ca",
      rock: "#3a3633",
      wall: "#1e1b19",
      grid: "#b3ab9e",
      wallWidth: 12,
      shadow: true,
    },
  },
  {
    id: "mono",
    label: "Noir et blanc",
    hint: "Pur noir et blanc, idéal pour imprimer.",
    value: {
      ...THEME,
      floor: "#ffffff",
      rock: "#ffffff",
      wall: "#000000",
      grid: "#9a9a9a",
      wallWidth: 5,
      hatch: true,
      water: "#9c9c9c",
      lava: "#4d4d4d",
      plants: "#7a7a7a",
      road: "#c8c8c8",
    },
  },
];

const presetOf = (id: StyleId) => MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0]!;
export const DEFAULT_MAP_STYLE: MapStyle = { preset: "theme", ...THEME };

/** Couleurs modifiables par le MJ, dans l'ordre du panneau. */
export const STYLE_COLORS: { key: keyof MapStyle & string; label: string }[] = [
  { key: "floor", label: "Sol" },
  { key: "rock", label: "Roche" },
  { key: "wall", label: "Murs" },
  { key: "grid", label: "Grille" },
  { key: "water", label: "Eau" },
  { key: "lava", label: "Lave" },
  { key: "plants", label: "Végétation" },
  { key: "road", label: "Route" },
];

const COLOR = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, fallback: string | null) =>
  v === null ? null : typeof v === "string" && COLOR.test(v) ? v.toLowerCase() : fallback;
const bounded = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/**
 * Lit la colonne `style` : le style choisi, puis les retouches enregistrées.
 * Une valeur illisible reprend celle du style, jamais une erreur d'affichage.
 */
export function readMapStyle(raw: unknown): MapStyle {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const preset = MAP_STYLES.some((s) => s.id === o["preset"]) ? (o["preset"] as StyleId) : "theme";
  const base = presetOf(preset).value;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const pick = (k: keyof Preset & string) =>
    has(k) ? color(o[k], base[k] as string | null) : base[k];
  return {
    preset,
    floor: pick("floor") as string | null,
    rock: pick("rock") as string | null,
    wall: pick("wall") as string | null,
    grid: pick("grid") as string | null,
    water: pick("water") as string | null,
    lava: pick("lava") as string | null,
    plants: pick("plants") as string | null,
    road: pick("road") as string | null,
    wallWidth: bounded(o["wallWidth"], 1, 20, base.wallWidth),
    hatch: flag(o["hatch"], base.hatch),
    hatchSize: bounded(o["hatchSize"], 0.25, 2, base.hatchSize),
    shadow: flag(o["shadow"], base.shadow),
    gridOutside: flag(o["gridOutside"], base.gridOutside),
  };
}

/** Ce qui s'enregistre : le style choisi et seulement ce qui s'en écarte. */
export function styleToJson(s: MapStyle) {
  const base = presetOf(s.preset).value;
  const out: Record<string, unknown> = { preset: s.preset };
  for (const k of Object.keys(base) as (keyof Preset)[]) if (s[k] !== base[k]) out[k] = s[k];
  return out;
}

/** Choisir un style repart de ses valeurs, sans les retouches de l'ancien. */
export const applyPreset = (id: StyleId): MapStyle => ({ preset: id, ...presetOf(id).value });

/** Le style a-t-il été retouché ? */
export const isTweaked = (s: MapStyle) => Object.keys(styleToJson(s)).length > 1;

/** Variables CSS du plateau : seules les couleurs choisies remplacent celles du thème. */
export function styleVars(s: MapStyle): Record<string, string> {
  const vars: Record<string, string> = { "--map-wall-w": String(s.wallWidth) };
  const set = (name: string, v: string | null) => {
    if (v) vars[name] = v;
  };
  set("--map-ground", s.floor);
  // Carte sans sols dessinés : tout le plateau est le sol
  set("--map-flat", s.floor);
  set("--map-rock", s.rock);
  set("--map-wall", s.wall);
  set("--map-grid", s.grid);
  set("--map-water", s.water);
  set("--map-lava", s.lava);
  set("--map-plants", s.plants);
  set("--map-road", s.road);
  return vars;
}

/** Bruit stable : chaque écran dessine les mêmes hachures. */
function noise(i: number) {
  const n = Math.sin(i * 91.345 + 47.853) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Motif de hachures : des paquets de trois traits parallèles, chacun dans sa direction.
 * Rendu en lignes SVG, sur un carreau de `size` pixels coupé en n × n petites cases.
 */
export function hatchTile(size: number, n = 4) {
  const step = size / n;
  const half = step * 0.48;
  const gap = step * 0.24;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < n * n; i++) {
    const cx = (i % n) * step + step / 2;
    const cy = Math.floor(i / n) * step + step / 2;
    const a = noise(i) * Math.PI;
    const dx = Math.cos(a) * half;
    const dy = Math.sin(a) * half;
    for (const k of [-1, 0, 1]) {
      const ox = -Math.sin(a) * gap * k;
      const oy = Math.cos(a) * gap * k;
      const r = (v: number) => Math.round(v * 10) / 10;
      lines.push({
        x1: r(cx + ox - dx),
        y1: r(cy + oy - dy),
        x2: r(cx + ox + dx),
        y2: r(cy + oy + dy),
      });
    }
  }
  return lines;
}
