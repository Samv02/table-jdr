/**
 * Objets posés sur la carte : symboles, images importées, escaliers et textes.
 * Chaque objet a son centre, sa taille et sa rotation, en cases ; il ne bloque jamais la vue.
 */
import type { Point } from "@/lib/map";
import { readConeFields, type Cone } from "@/lib/map-cones";
import { OBJECT_LOOKS, type ObjectLook } from "@/lib/map-style";

export const OBJECTS_MAX = 2000;
export const TEXT_MAX = 80;

export type ObjectKind = "symbol" | "image" | "stairs" | "text" | "light" | "camera";
export type MapObject = {
  id: string;
  k: ObjectKind;
  /** Centre, en cases */
  x: number;
  y: number;
  /** Taille, en cases ; pour un texte, h est la hauteur des lettres */
  w: number;
  h: number;
  /** Rotation, en degrés */
  r: number;
  /** Symbole : son identifiant */
  sym?: string;
  /** Image : son chemin dans le stockage de la table */
  src?: string;
  text?: string;
  /** Couleur choisie ; absente, l'objet prend la couleur des murs */
  color?: string;
  /** Opacité, de 0,1 à 1 ; absente = 1 */
  op?: number;
  /** Escalier : marches par case */
  steps?: number;
  /** Lumière : portée en cases */
  rad?: number;
  /** Lumière : part de la portée en pleine lumière, de 0 à 1 ; au-delà, elle décline */
  bright?: number;
  /** Lumière : vacille comme une flamme */
  flicker?: boolean;
  /** Carte où mène cet objet (escalier, échelle, portail) ; vide : nulle part */
  link?: string;
  /** Caméra : son champ de vision ; elle regarde dans la direction de sa rotation */
  cone?: Cone;
  /** Symbole : son dessin ; absent, il suit le style d'objets de la carte */
  look?: ObjectLook;
};

export const SYMBOL_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: "Mobilier",
    ids: [
      "Bed",
      "BedDouble",
      "Armchair",
      "Sofa",
      "Lamp",
      "LampFloor",
      "Library",
      "Archive",
      "Barrel",
      "Box",
      "Boxes",
      "Package",
      "Container",
      "Toolbox",
      "CookingPot",
      "Bath",
      "Toilet",
    ],
  },
  {
    label: "Nature",
    ids: [
      "TreePine",
      "TreeDeciduous",
      "Trees",
      "Shrub",
      "TreePalm",
      "Flower",
      "Sprout",
      "Mountain",
      "Waves",
      "Droplet",
      "Snowflake",
      "Flame",
    ],
  },
  {
    label: "Trésors",
    ids: [
      "Gem",
      "Coins",
      "Banknote",
      "Crown",
      "Key",
      "Lock",
      "BookOpen",
      "ScrollText",
      "Hourglass",
      "Dice5",
      "Wine",
      "Beer",
      "Gift",
      "Trophy",
    ],
  },
  {
    label: "Danger",
    ids: [
      "Sword",
      "Swords",
      "Axe",
      "Shield",
      "Bomb",
      "Skull",
      "Bone",
      "Biohazard",
      "Radiation",
      "TriangleAlert",
      "Target",
      "Zap",
    ],
  },
  {
    label: "Lieux",
    ids: [
      "Castle",
      "Church",
      "Tent",
      "Landmark",
      "Factory",
      "Warehouse",
      "Fence",
      "BrickWall",
      "Signpost",
      "Construction",
      "TrafficCone",
      "Pyramid",
      "Anchor",
      "Ship",
    ],
  },
  {
    label: "Technologie",
    ids: [
      "Server",
      "Cpu",
      "Monitor",
      "Cctv",
      "Router",
      "Antenna",
      "Satellite",
      "Battery",
      "Plug",
      "Bot",
      "Car",
      "Truck",
      "Rocket",
      "FlaskConical",
      "Microscope",
    ],
  },
  {
    label: "Créatures",
    ids: ["Ghost", "Bug", "Rat", "Bird", "Cat", "Dog", "Fish", "Snail", "Footprints", "Eye"],
  },
  {
    label: "Magie",
    ids: ["Wand", "WandSparkles", "Sparkles", "Atom", "Orbit", "Moon", "Star", "Sun"],
  },
];
export const SYMBOL_IDS = new Set(SYMBOL_GROUPS.flatMap((g) => g.ids));

/** Couleur de chaque famille, pour les pastilles (variables du thème). */
export const GROUP_COLORS: Record<string, string> = {
  Mobilier: "var(--orange)",
  Nature: "var(--green)",
  Trésors: "var(--yellow)",
  Danger: "var(--red)",
  Lieux: "var(--violet)",
  Technologie: "var(--cyan)",
  Créatures: "var(--pink)",
  Magie: "var(--violet)",
};
const GROUP_OF = new Map(SYMBOL_GROUPS.flatMap((g) => g.ids.map((id) => [id, g.label] as const)));
/** Famille d'un symbole (Mobilier, Nature…). */
export const symbolGroup = (sym: string | undefined) => (sym ? GROUP_OF.get(sym) : undefined);
/** Couleur de pastille d'un symbole. */
export const symbolColor = (sym: string | undefined) =>
  GROUP_COLORS[symbolGroup(sym) ?? ""] ?? "var(--cyan)";

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const round2 = (n: number) => Math.round(n * 100) / 100;
const COLOR = /^#[0-9a-f]{6}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Chemin d'image : dans le dossier de la table, sans remonter d'un niveau */
const PATH = /^[0-9a-f-]{36}\/objets\/[\w.-]{1,80}$/i;

/** Lit la colonne `objects` ; un objet illisible est ignoré, jamais une erreur d'affichage. */
export function readObjects(raw: unknown): MapObject[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MapObject[] = [];
  for (const item of raw.slice(0, OBJECTS_MAX)) {
    const o = (item ?? {}) as Record<string, unknown>;
    const id = typeof o["id"] === "string" ? o["id"].slice(0, 24) : "";
    const k = o["k"];
    if (!id || seen.has(id)) continue;
    if (
      k !== "symbol" &&
      k !== "image" &&
      k !== "stairs" &&
      k !== "text" &&
      k !== "light" &&
      k !== "camera"
    )
      continue;
    const obj: MapObject = {
      id,
      k,
      x: round2(num(o["x"], -5, 105, 0)),
      y: round2(num(o["y"], -5, 105, 0)),
      w: round2(num(o["w"], 0.1, 100, 1)),
      h: round2(num(o["h"], 0.1, 100, 1)),
      r: round2(((num(o["r"], -3600, 3600, 0) % 360) + 360) % 360),
    };
    if (k === "symbol") {
      if (typeof o["sym"] !== "string" || !SYMBOL_IDS.has(o["sym"])) continue;
      obj.sym = o["sym"];
      if (OBJECT_LOOKS.some((l) => l.id === o["look"])) obj.look = o["look"] as ObjectLook;
    }
    if (k === "image") {
      if (typeof o["src"] !== "string" || !PATH.test(o["src"])) continue;
      obj.src = o["src"];
    }
    if (k === "text") {
      const text = typeof o["text"] === "string" ? o["text"].slice(0, TEXT_MAX) : "";
      if (!text.trim()) continue;
      obj.text = text;
    }
    if (typeof o["link"] === "string" && UUID.test(o["link"])) obj.link = o["link"];
    if (k === "light") {
      obj.rad = round2(num(o["rad"], 0.5, 60, 4));
      obj.bright = round2(num(o["bright"], 0, 1, 0.5));
      if (o["flicker"] === true) obj.flicker = true;
    }
    if (k === "camera") {
      const c = o["cone"];
      obj.cone = readConeFields(c && typeof c === "object" ? (c as Record<string, unknown>) : {});
      // Une caméra peut porter un nom, montré quand elle repère quelqu'un
      if (typeof o["text"] === "string" && o["text"].trim()) obj.text = o["text"].slice(0, 40);
    }
    if (k === "stairs") obj.steps = Math.round(num(o["steps"], 1, 8, 3));
    if (typeof o["color"] === "string" && COLOR.test(o["color"])) obj.color = o["color"];
    const op = num(o["op"], 0.1, 1, 1);
    if (op < 1) obj.op = round2(op);
    seen.add(id);
    out.push(obj);
  }
  return out;
}

export const objectsToJson = (objects: MapObject[]) => readObjects(objects);

/** Identifiant court, propre à la carte. */
export function newObjectId(taken: { id: string }[]) {
  const ids = new Set(taken.map((o) => o.id));
  let id = "";
  do id = Math.random().toString(36).slice(2, 10);
  while (!id || ids.has(id));
  return id;
}

/** Largeur occupée par un texte, estimée d'après le nombre de lettres. */
export const textWidth = (o: MapObject) => Math.max(0.5, (o.text ?? "").length * o.h * 0.58);
/** Boîte réelle d'un objet (un texte s'étire avec ses lettres). */
/** Une lumière se prend par son petit soleil, sa portée se règle dans sa barre. */
export const LIGHT_BOX = 0.8;
export const boxOf = (o: MapObject) =>
  o.k === "light"
    ? { w: LIGHT_BOX, h: LIGHT_BOX }
    : { w: o.k === "text" ? textWidth(o) : o.w, h: o.h };

/** Le point est-il sur l'objet ? On ramène le point dans le repère tourné de l'objet. */
export function hitsObject(o: MapObject, p: Point, margin = 0) {
  const a = (-o.r * Math.PI) / 180;
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  const { w, h } = boxOf(o);
  return Math.abs(lx) <= w / 2 + margin && Math.abs(ly) <= h / 2 + margin;
}

/** L'objet du dessus sous le pointeur. */
export function objectAt(objects: MapObject[], p: Point) {
  for (let i = objects.length - 1; i >= 0; i--) if (hitsObject(objects[i]!, p)) return objects[i]!;
  return null;
}

/** Point du repère de l'objet (lx, ly) ramené sur la carte. */
export function toMap(o: MapObject, lx: number, ly: number): Point {
  const a = (o.r * Math.PI) / 180;
  return {
    x: o.x + lx * Math.cos(a) - ly * Math.sin(a),
    y: o.y + lx * Math.sin(a) + ly * Math.cos(a),
  };
}

/** Rotation vers un point, calée tous les 15° sauf demande contraire. */
export function rotationTo(o: Point, p: Point, free: boolean) {
  const deg = (Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI + 90;
  const r = free ? deg : Math.round(deg / 15) * 15;
  return round2(((r % 360) + 360) % 360);
}

/** Nouvelle taille quand on tire un coin : le centre ne bouge pas, les proportions restent. */
export function resizeTo(o: MapObject, p: Point, free: boolean): Pick<MapObject, "w" | "h"> {
  const a = (-o.r * Math.PI) / 180;
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const lx = Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) * 2;
  const ly = Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) * 2;
  if (o.k === "text") return { w: o.w, h: round2(Math.min(10, Math.max(0.2, ly))) };
  if (free) return { w: round2(Math.max(0.2, lx)), h: round2(Math.max(0.2, ly)) };
  const k = Math.max(0.2 / Math.min(o.w, o.h), Math.max(lx / o.w, ly / o.h));
  return { w: round2(o.w * k), h: round2(o.h * k) };
}

/** Retouche d'un objet ; `look: "auto"` le rend au style d'objets de la carte. */
export type ObjectPatch = Partial<Omit<MapObject, "look">> & { look?: ObjectLook | "auto" };
export function updateObject(list: MapObject[], id: string, patch: ObjectPatch): MapObject[] {
  return list.map((o) => {
    if (o.id !== id) return o;
    const { look, ...rest } = patch;
    const next: MapObject = { ...o, ...rest };
    if (look === "auto") delete next.look;
    else if (look) next.look = look;
    return next;
  });
}

/** Devant (à la fin de la liste) ou derrière (au début). */
export function restack(list: MapObject[], id: string, front: boolean) {
  const o = list.find((x) => x.id === id);
  if (!o) return list;
  const rest = list.filter((x) => x.id !== id);
  return front ? [...rest, o] : [o, ...rest];
}

/** Réglages du tampon : un symbole ou une image répétés au fil du pinceau. */
export type StampSettings = {
  /** Écart entre deux copies, en cases */
  spacing: number;
  min: number;
  max: number;
  /** Rotation au hasard */
  spin: boolean;
  /** Dispersion autour du pinceau, en cases */
  scatter: number;
};
export const DEFAULT_STAMP: StampSettings = {
  spacing: 1,
  min: 0.8,
  max: 1.4,
  spin: true,
  scatter: 0.4,
};

/** Une copie du tampon ; `rand` est injectable pour les tests. */
export function stampAt(
  base: Omit<MapObject, "id" | "x" | "y" | "w" | "h" | "r">,
  p: Point,
  s: StampSettings,
  taken: { id: string }[],
  rand: () => number = Math.random,
): MapObject {
  const size = round2(s.min + (s.max - s.min) * rand());
  const angle = rand() * Math.PI * 2;
  const dist = rand() * s.scatter;
  return {
    ...base,
    id: newObjectId(taken),
    x: round2(p.x + Math.cos(angle) * dist),
    y: round2(p.y + Math.sin(angle) * dist),
    w: size,
    h: size,
    r: s.spin ? Math.round(rand() * 360) : 0,
  };
}

/** Nom affiché de chaque symbole. */
export const SYMBOL_LABELS: Record<string, string> = {
  Bed: "Lit",
  BedDouble: "Lit double",
  Armchair: "Fauteuil",
  Sofa: "Canapé",
  Lamp: "Lampe",
  LampFloor: "Lampadaire",
  Library: "Bibliothèque",
  Archive: "Coffre",
  Barrel: "Tonneau",
  Box: "Caisse",
  Boxes: "Caisses",
  Package: "Colis",
  Container: "Conteneur",
  Toolbox: "Caisse à outils",
  CookingPot: "Marmite",
  Bath: "Baignoire",
  Toilet: "Toilettes",
  TreePine: "Sapin",
  TreeDeciduous: "Arbre",
  Trees: "Bosquet",
  Shrub: "Buisson",
  TreePalm: "Palmier",
  Flower: "Fleur",
  Sprout: "Pousse",
  Mountain: "Rochers",
  Waves: "Vagues",
  Droplet: "Goutte",
  Snowflake: "Glace",
  Flame: "Feu",
  Gem: "Gemme",
  Coins: "Pièces",
  Banknote: "Billets",
  Crown: "Couronne",
  Key: "Clé",
  Lock: "Serrure",
  BookOpen: "Livre",
  ScrollText: "Parchemin",
  Hourglass: "Sablier",
  Dice5: "Dé",
  Wine: "Vin",
  Beer: "Chope",
  Gift: "Cadeau",
  Trophy: "Trophée",
  Sword: "Épée",
  Swords: "Épées croisées",
  Axe: "Hache",
  Shield: "Bouclier",
  Bomb: "Bombe",
  Skull: "Crâne",
  Bone: "Os",
  Biohazard: "Danger biologique",
  Radiation: "Radiation",
  TriangleAlert: "Attention",
  Target: "Cible",
  Zap: "Éclair",
  Castle: "Château",
  Church: "Temple",
  Tent: "Tente",
  Landmark: "Monument",
  Factory: "Usine",
  Warehouse: "Entrepôt",
  Fence: "Barrière",
  BrickWall: "Muret",
  Signpost: "Panneau",
  Construction: "Chantier",
  TrafficCone: "Cône",
  Pyramid: "Pyramide",
  Anchor: "Ancre",
  Ship: "Navire",
  Server: "Serveur",
  Cpu: "Puce",
  Monitor: "Écran",
  Cctv: "Caméra",
  Router: "Routeur",
  Antenna: "Antenne",
  Satellite: "Satellite",
  Battery: "Batterie",
  Plug: "Prise",
  Bot: "Robot",
  Car: "Voiture",
  Truck: "Camion",
  Rocket: "Fusée",
  FlaskConical: "Fiole",
  Microscope: "Microscope",
  Ghost: "Fantôme",
  Bug: "Insecte",
  Rat: "Rat",
  Bird: "Oiseau",
  Cat: "Chat",
  Dog: "Chien",
  Fish: "Poisson",
  Snail: "Escargot",
  Footprints: "Traces",
  Eye: "Œil",
  Wand: "Baguette",
  WandSparkles: "Sortilège",
  Sparkles: "Étincelles",
  Atom: "Atome",
  Orbit: "Orbite",
  Moon: "Lune",
  Star: "Étoile",
  Sun: "Soleil",
};

/** Centre calé pour que les bords de l'objet tombent sur la grille (step 0 : libre). */
export function snapObjectCenter(
  c: Point,
  o: MapObject,
  step: number,
  w: number,
  h: number,
): Point {
  const box = boxOf(o);
  const fit = (v: number, size: number, max: number) => {
    const snapped = step ? Math.round((v - size / 2) / step) * step + size / 2 : v;
    return round2(Math.min(max, Math.max(0, snapped)));
  };
  return { x: fit(c.x, box.w, w), y: fit(c.y, box.h, h) };
}
