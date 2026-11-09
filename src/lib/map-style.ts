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

export type StyleId =
  | "theme"
  | "hatch"
  | "parchment"
  | "blueprint"
  | "solid"
  | "mono"
  | "engraving"
  | "notebook"
  | "stone"
  | "architect"
  | "station"
  | "neon"
  | "hologram"
  | "tactical";

/** Grain posé sur toute la carte */
export type MapTexture = "none" | "paper" | "grain" | "stone" | "scan" | "dots";
/** Trait des murs */
export type WallLine = "solid" | "double" | "sketch";
export type GridLine = "line" | "dots" | "dash";
/** Police des textes posés sur la carte */
export type MapFont = "theme" | "serif" | "mono" | "hand";
/** Dessin des symboles posés sur la carte */
export type ObjectLook = "line" | "ink" | "flat" | "neon" | "plan" | "token";
export const OBJECT_LOOKS: { id: ObjectLook; label: string; hint: string }[] = [
  { id: "line", label: "Trait", hint: "Un trait net, dans la couleur des murs." },
  { id: "ink", label: "Encre", hint: "À l’ancienne : plume sépia, trait tremblé, lavis." },
  { id: "flat", label: "Pastille", hint: "Moderne : une pastille colorée par famille d’objets." },
  { id: "neon", label: "Néon", hint: "Un trait lumineux qui brille dans le noir." },
  { id: "plan", label: "Plan", hint: "Technique : trait fin dans un cadre en pointillés." },
  { id: "token", label: "Pion", hint: "Comme un jeton de jeu posé sur la table." },
];
/** Époque d'un style, pour ranger la liste */
export type StyleEra = "old" | "classic" | "modern";

export const TEXTURES: { id: MapTexture; label: string; hint: string }[] = [
  { id: "none", label: "Aucune", hint: "Des aplats nets." },
  { id: "paper", label: "Papier", hint: "Un vieux papier un peu taché." },
  { id: "grain", label: "Grain", hint: "Un grain fin, comme une gravure." },
  { id: "stone", label: "Pierre", hint: "Des dalles et de la roche usées." },
  { id: "scan", label: "Écran", hint: "Les lignes d’un écran." },
  { id: "dots", label: "Trame", hint: "Une trame de points, façon impression." },
];
export const WALL_LINES: { id: WallLine; label: string; hint: string }[] = [
  { id: "solid", label: "Plein", hint: "Un trait net." },
  { id: "double", label: "Double", hint: "Deux traits, comme un plan d’architecte." },
  { id: "sketch", label: "À la main", hint: "Un trait tremblé, dessiné à la plume." },
];
export const GRID_LINES: { id: GridLine; label: string }[] = [
  { id: "line", label: "Lignes" },
  { id: "dash", label: "Tirets" },
  { id: "dots", label: "Points" },
];
export const MAP_FONTS: { id: MapFont; label: string; css: string | null }[] = [
  { id: "theme", label: "Du thème", css: null },
  { id: "serif", label: "Ancienne", css: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Technique", css: "var(--mono)" },
  {
    id: "hand",
    label: "Manuscrite",
    css: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive",
  },
];
export const STYLE_ERAS: { id: StyleEra; label: string }[] = [
  { id: "old", label: "À l’ancienne" },
  { id: "classic", label: "Classiques" },
  { id: "modern", label: "Modernes" },
];

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
  texture: MapTexture;
  wallLine: WallLine;
  gridLine: GridLine;
  font: MapFont;
  /** Lueur autour des murs, de 0 (aucune) à 1 */
  glow: number;
  /** Bords de la carte assombris */
  vignette: boolean;
  /** Dessin des symboles, si l'objet n'en choisit pas un lui-même */
  objLook: ObjectLook;
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
  texture: "none",
  wallLine: "solid",
  gridLine: "line",
  font: "theme",
  glow: 0,
  vignette: false,
  objLook: "line",
};
const NATURE = { water: "#4f8fc9", lava: "#e0531f", plants: "#5d8a45", road: "#a08867" };

export const MAP_STYLES: {
  id: StyleId;
  label: string;
  hint: string;
  era: StyleEra;
  value: Preset;
}[] = [
  {
    id: "theme",
    label: "Thème",
    hint: "Les couleurs de l’univers de la table.",
    era: "classic",
    value: THEME,
  },
  {
    id: "hatch",
    label: "Hachures",
    hint: "Murs noirs et hachures autour, le plan de donjon classique.",
    era: "classic",
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
    hint: "Vieux papier taché, encre brune et lettres anciennes.",
    era: "old",
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
      texture: "paper",
      font: "serif",
      vignette: true,
      objLook: "ink",
    },
  },
  {
    id: "blueprint",
    label: "Plan bleu",
    hint: "Roche bleue et salles blanches, façon vieux modules.",
    era: "classic",
    value: {
      ...THEME,
      ...NATURE,
      floor: "#f7f9fc",
      rock: "#2f6db5",
      wall: "#2f6db5",
      grid: "#8fb1dd",
      wallWidth: 4,
      gridOutside: true,
      objLook: "plan",
    },
  },
  {
    id: "solid",
    label: "Murs pleins",
    hint: "Murs épais et sombres, pour les bâtiments.",
    era: "classic",
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
    era: "classic",
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
  {
    id: "engraving",
    label: "Gravure",
    hint: "Encre sépia, trait tremblé et grain fin, comme un vieux livre.",
    era: "old",
    value: {
      ...THEME,
      floor: "#efe4cc",
      rock: "#d9c8a3",
      wall: "#2b2118",
      grid: "#c9b58d",
      wallWidth: 4,
      hatch: true,
      hatchSize: 0.5,
      water: "#7f9a9a",
      lava: "#a8482a",
      plants: "#6f7a45",
      road: "#bba67c",
      texture: "grain",
      wallLine: "sketch",
      font: "serif",
      vignette: true,
      objLook: "ink",
    },
  },
  {
    id: "notebook",
    label: "Carnet",
    hint: "Papier quadrillé et stylo bleu, la carte griffonnée en partie.",
    era: "old",
    value: {
      ...THEME,
      floor: "#fdfcf6",
      rock: "#f6f3e8",
      wall: "#24398f",
      grid: "#bfd0ec",
      wallWidth: 3,
      gridOutside: true,
      water: "#8fb5e0",
      lava: "#e07a5f",
      plants: "#9cc28a",
      road: "#d9cfb8",
      wallLine: "sketch",
      font: "hand",
      objLook: "ink",
    },
  },
  {
    id: "stone",
    label: "Pierre",
    hint: "Dalles grises, roche sombre et ombres : le donjon de pierre.",
    era: "old",
    value: {
      ...THEME,
      ...NATURE,
      floor: "#8d877b",
      rock: "#2e2b27",
      wall: "#16130f",
      grid: "#6f6a60",
      wallWidth: 7,
      shadow: true,
      texture: "stone",
      font: "serif",
      vignette: true,
      objLook: "ink",
    },
  },
  {
    id: "architect",
    label: "Architecte",
    hint: "Plan d’architecte : murs doubles, grille en points, lettres techniques.",
    era: "modern",
    value: {
      ...THEME,
      floor: "#ffffff",
      rock: "#eceef1",
      wall: "#2b2f36",
      grid: "#b7bec8",
      wallWidth: 7,
      water: "#9cc7e6",
      lava: "#ef8a62",
      plants: "#a7d0a0",
      road: "#d5d9de",
      wallLine: "double",
      gridLine: "dots",
      font: "mono",
      objLook: "plan",
    },
  },
  {
    id: "station",
    label: "Station",
    hint: "Coursives métalliques et sols clairs, pour un vaisseau ou un labo.",
    era: "modern",
    value: {
      ...THEME,
      floor: "#c9d1d9",
      rock: "#151a21",
      wall: "#5d6d7e",
      grid: "#a7b3bf",
      wallWidth: 8,
      shadow: true,
      water: "#5fb3d9",
      lava: "#ff6b3d",
      plants: "#6fbf73",
      road: "#7d8896",
      wallLine: "double",
      gridLine: "dash",
      font: "mono",
      objLook: "plan",
    },
  },
  {
    id: "neon",
    label: "Néon",
    hint: "Murs lumineux sur fond nuit, lignes d’écran.",
    era: "modern",
    value: {
      ...THEME,
      floor: "#12101f",
      rock: "#06050c",
      wall: "#ff2bd6",
      grid: "#2c2550",
      wallWidth: 3,
      water: "#00e5ff",
      lava: "#ff5a1f",
      plants: "#39ff88",
      road: "#2a2440",
      texture: "scan",
      font: "mono",
      glow: 0.9,
      vignette: true,
      objLook: "neon",
    },
  },
  {
    id: "hologram",
    label: "Hologramme",
    hint: "Une projection bleue qui flotte : traits clairs et lueur douce.",
    era: "modern",
    value: {
      ...THEME,
      floor: "#062a3a",
      rock: "#020b12",
      wall: "#5ff3ff",
      grid: "#0f5d70",
      wallWidth: 2,
      water: "#2fa8ff",
      lava: "#ff7a59",
      plants: "#3dffb0",
      road: "#0b3e52",
      texture: "scan",
      gridLine: "dots",
      font: "mono",
      glow: 0.6,
      objLook: "neon",
    },
  },
  {
    id: "tactical",
    label: "Tactique",
    hint: "Carte militaire : fond kaki, traits clairs et trame de points.",
    era: "modern",
    value: {
      ...THEME,
      floor: "#2d362c",
      rock: "#161b16",
      wall: "#c8d6a0",
      grid: "#46533f",
      wallWidth: 3,
      gridOutside: true,
      water: "#3f6f7f",
      lava: "#c4532a",
      plants: "#4f6b3a",
      road: "#4a4a3a",
      texture: "dots",
      gridLine: "dash",
      font: "mono",
      objLook: "token",
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
const oneOf = <T extends string>(v: unknown, list: { id: T }[], fallback: T): T =>
  list.some((x) => x.id === v) ? (v as T) : fallback;

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
    texture: oneOf(o["texture"], TEXTURES, base.texture),
    wallLine: oneOf(o["wallLine"], WALL_LINES, base.wallLine),
    gridLine: oneOf(o["gridLine"], GRID_LINES, base.gridLine),
    font: oneOf(o["font"], MAP_FONTS, base.font),
    glow: bounded(o["glow"], 0, 1, base.glow),
    vignette: flag(o["vignette"], base.vignette),
    objLook: oneOf(o["objLook"], OBJECT_LOOKS, base.objLook),
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
  set("--map-font", MAP_FONTS.find((x) => x.id === s.font)?.css ?? null);
  if (s.glow > 0) vars["--map-glow"] = `${Math.round(s.glow * 12)}px`;
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
