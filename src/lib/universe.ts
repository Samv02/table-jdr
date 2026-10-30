/**
 * UNIVERS DE JEU — tout ce qui change d'un jeu de rôle à l'autre.
 *
 *   theme   couleurs, polices, coins, effets d'ambiance
 *   words   vocabulaire affiché (monnaie, messagerie, sections…)
 *   rules   caractéristiques, dé de compétence, formules (PV, jauges, mains nues…)
 *   modules blocs activés ou non (munitions, argent, emplacements…)
 *
 * Le MJ règle l'univers dans MJ → Univers ; il est stocké dans session_state.universe
 * et diffusé en direct à toute la table. Tout est relu via normalizeUniverse :
 * un univers incomplet ou ancien est toujours complété avec des valeurs sûres.
 */
import { checkFormula, evalFormula, varKey } from "./formula";

export type Hue = "cyan" | "pink" | "yellow" | "red" | "green" | "violet";
export type Corners = "cut" | "round" | "square";
export type Atmosphere = "none" | "rain" | "embers" | "ash" | "stars" | "fog";
export type RollMode = "over" | "under";
/** Critique : dé au maximum, au minimum, doubles (d100), ou jamais */
export type CritRule = "max" | "min" | "doubles" | "none";

export type StatDef = { key: string; label: string; aliases?: string[] | undefined };
export type FieldDef = { key: string; label: string };
/** Jauge (humanité, mana, santé mentale…) : maximum par formule, ou saisi par le MJ si `max` est vide */
export type GaugeDef = { key: string; label: string; max: string; color: Hue };

export type Theme = {
  bg: string;
  panel: string;
  text: string;
  mute: string;
  /** Six couleurs d'accent. Les noms internes (cyan, pink…) sont des emplacements, pas des teintes imposées. */
  cyan: string;
  pink: string;
  yellow: string;
  red: string;
  green: string;
  violet: string;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  corners: Corners;
  glow: boolean;
  scanlines: boolean;
  atmosphere: Atmosphere;
};

export type Words = {
  tableName: string;
  tagline: string;
  playerDefault: string;
  vitals: string;
  hp: string;
  hpOk: string;
  hpHurt: string;
  hpDying: string;
  wounded: string;
  stats: string;
  skills: string;
  weapons: string;
  features: string;
  inventory: string;
  shop: string;
  notes: string;
  money: string;
  moneySymbol: string;
  messaging: string;
  announcements: string;
  privateCall: string;
  privateCalls: string;
  slots: string;
  slotItem: string;
  slotUnit: string;
  attack: string;
  damage: string;
  rof: string;
  magazine: string;
  spare: string;
  loose: string;
  rounds: string;
  fire: string;
  reload: string;
};

export type Rules = {
  stats: StatDef[];
  /** Dé lancé pour une compétence, ex. 1d10 */
  skillDice: { count: number; sides: number };
  /** over : dé + base (le MJ fixe la difficulté). under : réussite si le dé ≤ base (jets de pourcentage) */
  rollMode: RollMode;
  /** Base d'une compétence. Variables : STAT (valeur de la carac), NIV (niveau), et toutes les caracs */
  skillBase: string;
  crit: CritRule;
  fumble: CritRule;
  /** PV max. Vide = saisi à la main par le MJ */
  hpMax: string;
  /** Seuil « gravement blessé ». Variable MAX = PV max. Vide = pas de seuil */
  woundedAt: string;
  deathSave: { label: string; formula: string } | null;
  gauges: GaugeDef[];
  defenses: FieldDef[];
  infoFields: FieldDef[];
  /** Dégâts à mains nues : nombre de dés (formule) et faces. Vide = dégâts écrits sur l'arme */
  unarmed: { count: string; sides: number } | null;
  /** Caractéristique par défaut des armes à distance / de mêlée sans compétence apprise */
  rangedStat: string;
  meleeStat: string;
  /** Tir automatique (×10) et rafale (×2) pour les armes à cadence de tir */
  autofire: boolean;
  /** Ordre d'affichage des compétences (début des noms) ; le reste suit par ordre alphabétique */
  skillOrder: string[];
};

export type Modules = {
  ammo: boolean;
  money: boolean;
  slots: boolean;
  features: boolean;
  ecg: boolean;
  shop: boolean;
};

/** Fiche de départ : ce que reçoit chaque nouvelle fiche. Une carac absente garde la valeur habituelle. */
export type TemplateSkill = { name: string; stat: string; level: number };
export type Template = {
  stats: Record<string, number>;
  money: number;
  slots: number;
  skills: TemplateSkill[];
  /** Objets du catalogue donnés à la création */
  items: string[];
};
export const EMPTY_TEMPLATE: Template = { stats: {}, money: 0, slots: 0, skills: [], items: [] };

export type Universe = {
  version: 1;
  preset: string;
  theme: Theme;
  words: Words;
  rules: Rules;
  modules: Modules;
  template: Template;
};

/* ------------------------------------------------------------------ */
/* Polices proposées (Google Fonts)                                    */
/* ------------------------------------------------------------------ */
export const FONTS: {
  id: string;
  label: string;
  family: string;
  query: string;
  kind: "display" | "body" | "mono";
}[] = [
  {
    id: "Inter",
    label: "Inter (moderne)",
    family: "'Inter',system-ui,sans-serif",
    query: "Inter:wght@400;500;600;700",
    kind: "body",
  },
  {
    id: "Chakra Petch",
    label: "Chakra Petch (tech)",
    family: "'Chakra Petch',system-ui,sans-serif",
    query: "Chakra+Petch:wght@400;500;600;700",
    kind: "body",
  },
  {
    id: "Rajdhani",
    label: "Rajdhani (SF)",
    family: "'Rajdhani',system-ui,sans-serif",
    query: "Rajdhani:wght@500;600;700",
    kind: "body",
  },
  {
    id: "Alegreya",
    label: "Alegreya (livre)",
    family: "'Alegreya',Georgia,serif",
    query: "Alegreya:wght@400;500;700",
    kind: "body",
  },
  {
    id: "Crimson Pro",
    label: "Crimson Pro (classique)",
    family: "'Crimson Pro',Georgia,serif",
    query: "Crimson+Pro:wght@400;500;600;700",
    kind: "body",
  },
  {
    id: "EB Garamond",
    label: "EB Garamond (ancien)",
    family: "'EB Garamond',Georgia,serif",
    query: "EB+Garamond:wght@400;500;600;700",
    kind: "body",
  },
  {
    id: "Cinzel",
    label: "Cinzel (épique)",
    family: "'Cinzel',Georgia,serif",
    query: "Cinzel:wght@500;600;700",
    kind: "display",
  },
  {
    id: "IM Fell English SC",
    label: "IM Fell English (gravure)",
    family: "'IM Fell English SC',Georgia,serif",
    query: "IM+Fell+English+SC",
    kind: "display",
  },
  {
    id: "Grenze Gotisch",
    label: "Grenze Gotisch (gothique)",
    family: "'Grenze Gotisch',Georgia,serif",
    query: "Grenze+Gotisch:wght@500;600;700",
    kind: "display",
  },
  {
    id: "Special Elite",
    label: "Special Elite (machine à écrire)",
    family: "'Special Elite',Georgia,serif",
    query: "Special+Elite",
    kind: "display",
  },
  {
    id: "Orbitron",
    label: "Orbitron (futuriste)",
    family: "'Orbitron',system-ui,sans-serif",
    query: "Orbitron:wght@500;600;700",
    kind: "display",
  },
  {
    id: "JetBrains Mono",
    label: "JetBrains Mono",
    family: "'JetBrains Mono',ui-monospace,monospace",
    query: "JetBrains+Mono:wght@400;600",
    kind: "mono",
  },
  {
    id: "IBM Plex Mono",
    label: "IBM Plex Mono",
    family: "'IBM Plex Mono',ui-monospace,monospace",
    query: "IBM+Plex+Mono:wght@400;600",
    kind: "mono",
  },
  {
    id: "Courier Prime",
    label: "Courier Prime",
    family: "'Courier Prime',ui-monospace,monospace",
    query: "Courier+Prime:wght@400;700",
    kind: "mono",
  },
];
export const fontFamily = (id: string) =>
  FONTS.find((f) => f.id === id)?.family ?? `'${id}',system-ui,sans-serif`;
export function fontsHref(t: Pick<Theme, "fontDisplay" | "fontBody" | "fontMono">) {
  const q = [...new Set([t.fontDisplay, t.fontBody, t.fontMono])]
    .map((id) => FONTS.find((f) => f.id === id)?.query)
    .filter(Boolean)
    .map((x) => `family=${x}`)
    .join("&");
  return q ? `https://fonts.googleapis.com/css2?${q}&display=swap` : "";
}

/* ------------------------------------------------------------------ */
/* Préréglages                                                         */
/* ------------------------------------------------------------------ */
const NEUTRAL_WORDS: Words = {
  tableName: "La Table",
  tagline: "Jeu de rôle entre amis",
  playerDefault: "Joueur",
  vitals: "Santé",
  hp: "PV",
  hpOk: "EN FORME",
  hpHurt: "GRAVEMENT BLESSÉ",
  hpDying: "HORS DE COMBAT",
  wounded: "Gravement blessé",
  stats: "Caractéristiques",
  skills: "Compétences",
  weapons: "Armes",
  features: "Particularités",
  inventory: "Inventaire",
  shop: "Boutique",
  notes: "Bloc-notes",
  money: "Argent",
  moneySymbol: "¤",
  messaging: "Messagerie",
  announcements: "Annonces",
  privateCall: "Conversation privée",
  privateCalls: "Conversations privées",
  slots: "Pouvoirs",
  slotItem: "Pouvoir",
  slotUnit: "emplacement",
  attack: "Attaque",
  damage: "Dégâts",
  rof: "Cadence",
  magazine: "Chargeur",
  spare: "Recharges",
  loose: "Vrac",
  rounds: "munitions",
  fire: "TIR",
  reload: "RECHARGER",
};

const NEUTRAL: Universe = {
  version: 1,
  preset: "neutre",
  theme: {
    bg: "#0b0e14",
    panel: "#111621",
    text: "#e6eaf2",
    mute: "#8b93a6",
    cyan: "#5fb3ff",
    pink: "#c07cff",
    yellow: "#ffc857",
    red: "#ff5d6c",
    green: "#4fd6a2",
    violet: "#9d8cff",
    fontDisplay: "Inter",
    fontBody: "Inter",
    fontMono: "IBM Plex Mono",
    corners: "round",
    glow: false,
    scanlines: false,
    atmosphere: "none",
  },
  words: NEUTRAL_WORDS,
  rules: {
    stats: [
      { key: "PHY", label: "Physique" },
      { key: "AGI", label: "Agilité" },
      { key: "ESP", label: "Esprit" },
      { key: "PER", label: "Perception" },
      { key: "VOL", label: "Volonté" },
      { key: "PRE", label: "Présence" },
    ],
    skillDice: { count: 1, sides: 20 },
    rollMode: "over",
    skillBase: "STAT + NIV",
    crit: "max",
    fumble: "min",
    hpMax: "10 + 2*PHY",
    woundedAt: "ceil(MAX/2)",
    deathSave: null,
    gauges: [],
    defenses: [{ key: "armor", label: "Armure" }],
    infoFields: [
      { key: "role", label: "Profil" },
      { key: "level", label: "Niveau" },
    ],
    unarmed: null,
    rangedStat: "AGI",
    meleeStat: "PHY",
    autofire: false,
    skillOrder: [],
  },
  modules: { ammo: true, money: true, slots: false, features: true, ecg: false, shop: true },
  template: EMPTY_TEMPLATE,
};

const FANTASY: Universe = {
  version: 1,
  preset: "fantasy",
  theme: {
    bg: "#0f0b08",
    panel: "#1a130d",
    text: "#f1e6d0",
    mute: "#a8987c",
    cyan: "#e0b45a",
    pink: "#c4563a",
    yellow: "#f2d27a",
    red: "#d9483b",
    green: "#7fb069",
    violet: "#9a7fd1",
    fontDisplay: "Cinzel",
    fontBody: "Alegreya",
    fontMono: "Courier Prime",
    corners: "square",
    glow: false,
    scanlines: false,
    atmosphere: "embers",
  },
  words: {
    ...NEUTRAL_WORDS,
    tableName: "Les Royaumes",
    tagline: "Taverne des aventuriers",
    playerDefault: "Aventurier",
    vitals: "Vitalité",
    hpOk: "VAILLANT",
    hpHurt: "GRIÈVEMENT BLESSÉ",
    hpDying: "AGONISANT",
    features: "Dons & traits",
    inventory: "Besace",
    notes: "Journal",
    money: "Bourse",
    moneySymbol: "po",
    messaging: "Missives",
    announcements: "Proclamations",
    privateCall: "Message secret",
    privateCalls: "Messages secrets",
    slots: "Grimoire",
    slotItem: "Sort",
    slotUnit: "emplacement",
    rof: "Attaques",
    magazine: "Carquois",
    spare: "Carquois de réserve",
    loose: "En vrac",
    rounds: "flèches",
    fire: "TIRER",
    reload: "REMPLIR",
  },
  rules: {
    stats: [
      { key: "FOR", label: "FOR" },
      { key: "DEX", label: "DEX" },
      { key: "CON", label: "CON" },
      { key: "INT", label: "INT" },
      { key: "SAG", label: "SAG" },
      { key: "CHA", label: "CHA" },
    ],
    skillDice: { count: 1, sides: 20 },
    rollMode: "over",
    skillBase: "floor((STAT-10)/2) + NIV",
    crit: "max",
    fumble: "min",
    hpMax: "10 + floor((CON-10)/2)*2",
    woundedAt: "ceil(MAX/2)",
    deathSave: { label: "Jet de sauvegarde", formula: "floor((CON-10)/2)" },
    gauges: [{ key: "manaCurrent", label: "Mana", max: "2*INT", color: "violet" }],
    defenses: [{ key: "armor", label: "Classe d'armure" }],
    infoFields: [
      { key: "race", label: "Peuple" },
      { key: "role", label: "Classe" },
      { key: "level", label: "Niveau" },
    ],
    unarmed: { count: "1", sides: 4 },
    rangedStat: "DEX",
    meleeStat: "FOR",
    autofire: false,
    skillOrder: [],
  },
  modules: { ammo: true, money: true, slots: true, features: true, ecg: false, shop: true },
  template: EMPTY_TEMPLATE,
};

const GRIMDARK: Universe = {
  version: 1,
  preset: "grimdark",
  theme: {
    bg: "#0a0909",
    panel: "#151212",
    text: "#e8e1d6",
    mute: "#958b7e",
    cyan: "#c9b38a",
    pink: "#8e1b1b",
    yellow: "#d4a24c",
    red: "#c0262d",
    green: "#6f8f5a",
    violet: "#7d5ba6",
    fontDisplay: "IM Fell English SC",
    fontBody: "Crimson Pro",
    fontMono: "IBM Plex Mono",
    corners: "square",
    glow: false,
    scanlines: false,
    atmosphere: "ash",
  },
  words: {
    ...NEUTRAL_WORDS,
    tableName: "L'Empire",
    tagline: "Un monde sombre et périlleux",
    playerDefault: "Errant",
    vitals: "Blessures",
    hp: "B",
    hpOk: "DEBOUT",
    hpHurt: "MAL EN POINT",
    hpDying: "À TERRE",
    wounded: "Mal en point",
    features: "Talents",
    inventory: "Possessions",
    notes: "Carnet",
    money: "Bourse",
    moneySymbol: "co",
    messaging: "Correspondance",
    announcements: "Édits",
    privateCall: "Pli scellé",
    privateCalls: "Plis scellés",
    slots: "Sorts",
    slotItem: "Sort",
    rof: "Attaques",
    magazine: "Chargé",
    spare: "Charges",
    loose: "Plombs",
    rounds: "plombs",
    fire: "FEU",
    reload: "RECHARGER",
  },
  rules: {
    stats: [
      { key: "CC", label: "CC" },
      { key: "CT", label: "CT" },
      { key: "F", label: "F" },
      { key: "E", label: "E" },
      { key: "I", label: "I" },
      { key: "AG", label: "Ag" },
      { key: "DEX", label: "Dex" },
      { key: "INT", label: "Int" },
      { key: "FM", label: "FM" },
      { key: "SOC", label: "Soc" },
    ],
    skillDice: { count: 1, sides: 100 },
    rollMode: "under",
    skillBase: "STAT + NIV",
    crit: "doubles",
    fumble: "doubles",
    hpMax: "floor(F/10) + 2*floor(E/10) + floor(FM/10)",
    woundedAt: "",
    deathSave: null,
    gauges: [
      { key: "fateCurrent", label: "Destin", max: "", color: "yellow" },
      { key: "resilienceCurrent", label: "Résilience", max: "", color: "cyan" },
      {
        key: "corruptionCurrent",
        label: "Corruption",
        max: "floor(FM/10) + floor(E/10)",
        color: "red",
      },
    ],
    defenses: [
      { key: "apHead", label: "PA tête" },
      { key: "apBody", label: "PA corps" },
      { key: "apArms", label: "PA bras" },
      { key: "apLegs", label: "PA jambes" },
    ],
    infoFields: [
      { key: "race", label: "Espèce" },
      { key: "role", label: "Carrière" },
      { key: "level", label: "Échelon" },
    ],
    unarmed: null,
    rangedStat: "CT",
    meleeStat: "CC",
    autofire: false,
    skillOrder: [],
  },
  modules: { ammo: true, money: true, slots: false, features: true, ecg: false, shop: true },
  template: EMPTY_TEMPLATE,
};

const HORROR: Universe = {
  version: 1,
  preset: "horreur",
  theme: {
    bg: "#0b0d0c",
    panel: "#141816",
    text: "#e4e2d6",
    mute: "#8f9488",
    cyan: "#8fb8a0",
    pink: "#7a3b5a",
    yellow: "#d8c27a",
    red: "#b2373a",
    green: "#6aa37f",
    violet: "#6f6aa8",
    fontDisplay: "Special Elite",
    fontBody: "EB Garamond",
    fontMono: "Courier Prime",
    corners: "square",
    glow: false,
    scanlines: false,
    atmosphere: "fog",
  },
  words: {
    ...NEUTRAL_WORDS,
    tableName: "Dossiers occultes",
    tagline: "Enquêtes et horreurs indicibles",
    playerDefault: "Investigateur",
    vitals: "Santé",
    hpOk: "INDEMNE",
    hpHurt: "BLESSURE GRAVE",
    hpDying: "MOURANT",
    wounded: "Blessure grave",
    features: "Phobies & manies",
    inventory: "Affaires",
    notes: "Carnet d'enquête",
    money: "Argent",
    moneySymbol: "$",
    messaging: "Télégrammes",
    announcements: "Gros titres",
    privateCall: "Échange discret",
    privateCalls: "Échanges discrets",
    slots: "Sortilèges",
    slotItem: "Sortilège",
    rof: "Tirs",
    magazine: "Barillet",
    spare: "Recharges",
    loose: "Cartouches",
    rounds: "cartouches",
  },
  rules: {
    stats: [
      { key: "FOR", label: "FOR" },
      { key: "CON", label: "CON" },
      { key: "TAI", label: "TAI" },
      { key: "DEX", label: "DEX" },
      { key: "APP", label: "APP" },
      { key: "EDU", label: "ÉDU" },
      { key: "INT", label: "INT" },
      { key: "POU", label: "POU" },
    ],
    skillDice: { count: 1, sides: 100 },
    rollMode: "under",
    skillBase: "NIV",
    crit: "min",
    fumble: "max",
    hpMax: "floor((CON+TAI)/10)",
    woundedAt: "ceil(MAX/2)",
    deathSave: null,
    gauges: [
      { key: "sanityCurrent", label: "Santé mentale", max: "99", color: "violet" },
      { key: "luckCurrent", label: "Chance", max: "99", color: "yellow" },
      { key: "magicCurrent", label: "Points de magie", max: "floor(POU/5)", color: "cyan" },
    ],
    defenses: [{ key: "armor", label: "Protection" }],
    infoFields: [
      { key: "role", label: "Occupation" },
      { key: "age", label: "Âge" },
    ],
    unarmed: { count: "1", sides: 3 },
    rangedStat: "DEX",
    meleeStat: "FOR",
    autofire: false,
    skillOrder: [],
  },
  modules: { ammo: true, money: true, slots: true, features: true, ecg: false, shop: true },
  template: EMPTY_TEMPLATE,
};

const CYBERPUNK: Universe = {
  version: 1,
  preset: "cyberpunk",
  theme: {
    bg: "#04050a",
    panel: "#070910",
    text: "#e9f1ff",
    mute: "#8590a8",
    cyan: "#00f0ff",
    pink: "#ff2a6d",
    yellow: "#fcee0a",
    red: "#ff003c",
    green: "#2bffc6",
    violet: "#b16bff",
    fontDisplay: "Chakra Petch",
    fontBody: "Chakra Petch",
    fontMono: "JetBrains Mono",
    corners: "cut",
    glow: true,
    scanlines: true,
    atmosphere: "rain",
  },
  words: {
    ...NEUTRAL_WORDS,
    tableName: "Night City",
    tagline: "Table · Cyberpunk",
    playerDefault: "Runner",
    vitals: "Signes vitaux",
    hpOk: "STABLE",
    hpHurt: "GRAVEMENT BLESSÉ · −2",
    hpDying: "MORTELLEMENT BLESSÉ",
    features: "Cyberware",
    money: "Eddies",
    moneySymbol: "€$",
    weapons: "Arsenal",
    messaging: "Holo-Net",
    announcements: "Annonces",
    privateCall: "Holo-Call",
    privateCalls: "Holo-Calls",
    slots: "Cyberdeck",
    slotItem: "Programme",
    slotUnit: "slot",
    rof: "CdT",
    magazine: "Dans l'arme",
    spare: "Rechanges",
    loose: "Vrac",
    rounds: "balles",
  },
  rules: {
    stats: [
      { key: "INT", label: "INT" },
      { key: "REF", label: "RÉF", aliases: ["RÉF", "REFLEXES"] },
      { key: "DEX", label: "DEX", aliases: ["ADR", "DEXTERITE"] },
      { key: "TECH", label: "TECH" },
      { key: "PRE", label: "PRÉ", aliases: ["COOL", "FROID", "PRESENCE"] },
      { key: "VOL", label: "VOL", aliases: ["WILL", "VOLONTE"] },
      { key: "CHANCE", label: "CHANCE", aliases: ["LUCK"] },
      { key: "MOUV", label: "MOUV", aliases: ["MOVE", "MOUVEMENT"] },
      { key: "CORPS", label: "CORPS", aliases: ["BODY"] },
      { key: "EMP", label: "EMP", aliases: ["EMPATHIE"] },
    ],
    skillDice: { count: 1, sides: 10 },
    rollMode: "over",
    skillBase: "STAT + NIV",
    crit: "max",
    fumble: "min",
    hpMax: "10 + 5*ceil((CORPS+VOL)/2)",
    woundedAt: "ceil(MAX/2)",
    deathSave: { label: "Jet de mort", formula: "CORPS" },
    gauges: [
      { key: "humanityCurrent", label: "Humanité", max: "EMP*10", color: "cyan" },
      { key: "statsChanceCurrent", label: "Chance", max: "CHANCE", color: "yellow" },
    ],
    defenses: [
      { key: "armorHead", label: "Armure tête" },
      { key: "armorBody", label: "Armure corps" },
    ],
    infoFields: [
      { key: "role", label: "Rôle" },
      { key: "roleRank", label: "Rang" },
      { key: "rep", label: "Rép" },
    ],
    unarmed: { count: "1 + (CORPS>=5) + (CORPS>=7) + (CORPS>=11)", sides: 6 },
    rangedStat: "REF",
    meleeStat: "DEX",
    autofire: true,
    skillOrder: [
      "Pistolet",
      "Fusil",
      "Tir automatique",
      "Mêlée",
      "Bagarre",
      "Esquive",
      "Athlétisme",
      "Infiltration",
      "Perception",
      "Piratage",
      "Cybertech",
      "Électronique",
      "Premier secours",
      "Persuasion",
      "Négociation",
      "Tromperie",
      "Connaissance de la rue",
      "Volonté",
    ],
  },
  modules: { ammo: true, money: true, slots: true, features: true, ecg: true, shop: true },
  template: EMPTY_TEMPLATE,
};

export const PRESETS: { id: string; label: string; description: string; universe: Universe }[] = [
  {
    id: "neutre",
    label: "Neutre",
    description: "Sobre et générique : 6 caractéristiques, d20 + base. Une bonne base à adapter.",
    universe: NEUTRAL,
  },
  {
    id: "fantasy",
    label: "Fantasy",
    description:
      "Médiéval fantastique : FOR DEX CON INT SAG CHA, d20 + modificateur, mana, grimoire.",
    universe: FANTASY,
  },
  {
    id: "grimdark",
    label: "Grimdark",
    description:
      "Monde sombre façon Warhammer : 10 caractéristiques, jets de pourcentage sous la compétence, critiques sur les doubles.",
    universe: GRIMDARK,
  },
  {
    id: "horreur",
    label: "Horreur 1920",
    description: "Enquêtes façon L'Appel de Cthulhu : compétences en %, santé mentale, chance.",
    universe: HORROR,
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    description:
      "Néons et chrome façon Cyberpunk RED : d10 + base, humanité, cyberdeck, tir automatique.",
    universe: CYBERPUNK,
  },
];
export const DEFAULT_UNIVERSE = NEUTRAL;
export const presetById = (id: string) => PRESETS.find((p) => p.id === id)?.universe ?? NEUTRAL;

/* ------------------------------------------------------------------ */
/* Lecture tolérante                                                   */
/* ------------------------------------------------------------------ */
const HUES: Hue[] = ["cyan", "pink", "yellow", "red", "green", "violet"];
const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const isStr = (v: unknown, max = 200): v is string => typeof v === "string" && v.length <= max;
const obj = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  allowed.includes(v as T) ? (v as T) : d;
const int = (v: unknown, min: number, max: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
function list<T>(
  v: unknown,
  read: (x: Record<string, unknown>) => T | null,
  max: number,
): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const x of v.slice(0, max)) {
    const r = read(obj(x));
    if (r) out.push(r);
  }
  return out;
}
const field = (x: Record<string, unknown>): FieldDef | null =>
  isStr(x["key"], 40) && x["key"].trim() && isStr(x["label"], 40)
    ? { key: x["key"].trim(), label: x["label"] }
    : null;

/** Complète et nettoie un univers venu de la base (ou d'un import) */
export function normalizeUniverse(raw: unknown): Universe {
  const r = obj(raw);
  const base = presetById(isStr(r["preset"], 40) ? r["preset"] : "neutre");
  const t = obj(r["theme"]);
  const theme: Theme = { ...base.theme };
  for (const k of ["bg", "panel", "text", "mute", ...HUES] as const)
    if (isColor(t[k])) theme[k] = t[k];
  for (const k of ["fontDisplay", "fontBody", "fontMono"] as const)
    if (isStr(t[k], 60) && t[k]) theme[k] = t[k];
  theme.corners = pick(t["corners"], ["cut", "round", "square"] as const, base.theme.corners);
  theme.atmosphere = pick(
    t["atmosphere"],
    ["none", "rain", "embers", "ash", "stars", "fog"] as const,
    base.theme.atmosphere,
  );
  if (typeof t["glow"] === "boolean") theme.glow = t["glow"];
  if (typeof t["scanlines"] === "boolean") theme.scanlines = t["scanlines"];

  const w = obj(r["words"]);
  const words = { ...base.words };
  for (const k of Object.keys(words) as (keyof Words)[])
    if (isStr(w[k], 60) && String(w[k]).trim()) words[k] = String(w[k]);

  const ru = obj(r["rules"]);
  const stats =
    list(
      ru["stats"],
      (x) => {
        const f = field(x);
        if (!f || !varKey(f.key)) return null;
        const aliases = Array.isArray(x["aliases"])
          ? x["aliases"].filter((a): a is string => isStr(a, 40)).slice(0, 8)
          : undefined;
        return {
          key: varKey(f.key),
          label: f.label || f.key,
          ...(aliases?.length ? { aliases } : {}),
        };
      },
      16,
    ) ?? base.rules.stats;
  const dice = obj(ru["skillDice"]);
  const death = ru["deathSave"];
  const unarmed = ru["unarmed"];
  const rules: Rules = {
    stats: stats.length ? dedupe(stats) : base.rules.stats,
    skillDice: {
      count: int(dice["count"], 1, 10, base.rules.skillDice.count),
      sides: int(dice["sides"], 2, 100, base.rules.skillDice.sides),
    },
    rollMode: pick(ru["rollMode"], ["over", "under"] as const, base.rules.rollMode),
    skillBase: isStr(ru["skillBase"]) ? ru["skillBase"] : base.rules.skillBase,
    crit: pick(ru["crit"], ["max", "min", "doubles", "none"] as const, base.rules.crit),
    fumble: pick(ru["fumble"], ["max", "min", "doubles", "none"] as const, base.rules.fumble),
    hpMax: isStr(ru["hpMax"]) ? ru["hpMax"] : base.rules.hpMax,
    woundedAt: isStr(ru["woundedAt"]) ? ru["woundedAt"] : base.rules.woundedAt,
    deathSave:
      death === null
        ? null
        : death &&
            typeof death === "object" &&
            isStr(obj(death)["label"], 40) &&
            isStr(obj(death)["formula"])
          ? { label: String(obj(death)["label"]), formula: String(obj(death)["formula"]) }
          : base.rules.deathSave,
    gauges:
      list(
        ru["gauges"],
        (x) => {
          const f = field(x);
          return f && isStr(x["max"] ?? "")
            ? { ...f, max: String(x["max"] ?? ""), color: pick(x["color"], HUES, "cyan") }
            : null;
        },
        8,
      ) ?? base.rules.gauges,
    defenses: list(ru["defenses"], field, 8) ?? base.rules.defenses,
    infoFields: list(ru["infoFields"], field, 6) ?? base.rules.infoFields,
    unarmed:
      unarmed === null
        ? null
        : unarmed && typeof unarmed === "object" && isStr(obj(unarmed)["count"])
          ? { count: String(obj(unarmed)["count"]), sides: int(obj(unarmed)["sides"], 2, 100, 6) }
          : base.rules.unarmed,
    rangedStat: isStr(ru["rangedStat"], 40) ? varKey(ru["rangedStat"]) : base.rules.rangedStat,
    meleeStat: isStr(ru["meleeStat"], 40) ? varKey(ru["meleeStat"]) : base.rules.meleeStat,
    autofire: typeof ru["autofire"] === "boolean" ? ru["autofire"] : base.rules.autofire,
    skillOrder: Array.isArray(ru["skillOrder"])
      ? ru["skillOrder"].filter((s): s is string => isStr(s, 60)).slice(0, 60)
      : base.rules.skillOrder,
  };
  const m = obj(r["modules"]);
  const modules = { ...base.modules };
  for (const k of Object.keys(modules) as (keyof Modules)[])
    if (typeof m[k] === "boolean") modules[k] = m[k] as boolean;
  return {
    version: 1,
    preset: base.preset,
    theme,
    words,
    rules,
    modules,
    template: readTemplate(r["template"]),
  };
}
function readTemplate(raw: unknown): Template {
  const t = obj(raw);
  const int = (v: unknown, min: number, max: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  };
  const stats: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(t["stats"]))) {
    if (k.length <= 40 && Number.isFinite(Number(v))) stats[k] = Number(v);
  }
  const skills = Array.isArray(t["skills"]) ? t["skills"] : [];
  const items = Array.isArray(t["items"]) ? t["items"] : [];
  return {
    stats,
    money: int(t["money"], 0, 100000000),
    slots: int(t["slots"], 0, 20),
    skills: skills.slice(0, 80).flatMap((s) => {
      const o = obj(s);
      return isStr(o["name"], 60) && isStr(o["stat"], 40)
        ? [{ name: o["name"], stat: o["stat"], level: int(o["level"], 0, 1000) }]
        : [];
    }),
    items: items.filter((i): i is string => isStr(i, 40)).slice(0, 50),
  };
}
function dedupe(stats: StatDef[]) {
  const seen = new Set<string>();
  return stats.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true)));
}

/** Toutes les erreurs de formule, pour la page Univers (clé → message) */
export function universeErrors(u: Universe): Record<string, string> {
  const statKeys = u.rules.stats.map((s) => s.key);
  const info = u.rules.infoFields.map((f) => f.key);
  const errs: Record<string, string> = {};
  const check = (id: string, f: string, extra: string[] = []) => {
    const e = checkFormula(f, [...statKeys, ...info, ...extra]);
    if (e) errs[id] = e;
  };
  check("skillBase", u.rules.skillBase, ["STAT", "NIV"]);
  check("hpMax", u.rules.hpMax);
  check("woundedAt", u.rules.woundedAt, ["MAX"]);
  if (u.rules.deathSave) check("deathSave", u.rules.deathSave.formula);
  if (u.rules.unarmed) check("unarmed", u.rules.unarmed.count);
  u.rules.gauges.forEach((g, i) => check(`gauge${i}`, g.max));
  if (!u.rules.stats.length) errs["stats"] = "Il faut au moins une caractéristique.";
  const keys = u.rules.stats.map((s) => s.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (keys.some((k) => !k)) errs["stats"] = "Chaque caractéristique doit avoir un code.";
  else if (dup) errs["stats"] = `Code en double : ${dup}`;
  else if (keys.some((k) => ["STAT", "NIV", "MAX"].includes(k)))
    errs["stats"] = "STAT, NIV et MAX sont réservés aux formules.";
  return errs;
}

/* ------------------------------------------------------------------ */
/* Calculs de règles                                                   */
/* ------------------------------------------------------------------ */
export type Stats = Record<string, number>;

/** Variables disponibles dans les formules : caractéristiques + champs d'identité numériques */
export function formulaVars(
  u: Universe,
  stats: Stats,
  sheet: Record<string, unknown> = {},
): Record<string, number> {
  const vars: Record<string, number> = {};
  for (const f of u.rules.infoFields) {
    const n = Number(sheet[f.key]);
    if (Number.isFinite(n)) vars[varKey(f.key)] = n;
  }
  for (const s of u.rules.stats) vars[s.key] = stats[s.key] ?? 0;
  return vars;
}

export function hpMaxFor(u: Universe, stats: Stats, sheet: Record<string, unknown>): number {
  if (!u.rules.hpMax.trim()) return Math.max(0, Math.round(Number(sheet["hpMax"]) || 0));
  return Math.max(0, evalFormula(u.rules.hpMax, formulaVars(u, stats, sheet)));
}
/** Seuil « gravement blessé » ; null si l'univers n'en a pas */
export function woundedFor(
  u: Universe,
  max: number,
  stats: Stats,
  sheet: Record<string, unknown>,
): number | null {
  if (!u.rules.woundedAt.trim()) return null;
  return evalFormula(u.rules.woundedAt, { ...formulaVars(u, stats, sheet), MAX: max });
}
export function deathSaveFor(
  u: Universe,
  stats: Stats,
  sheet: Record<string, unknown>,
): number | null {
  return u.rules.deathSave
    ? evalFormula(u.rules.deathSave.formula, formulaVars(u, stats, sheet))
    : null;
}
/** Maximum d'une jauge : formule, ou valeur saisie par le MJ (clé + "Max") */
export function gaugeMax(
  u: Universe,
  g: GaugeDef,
  stats: Stats,
  sheet: Record<string, unknown>,
): number {
  if (!g.max.trim()) return Math.max(0, Math.round(Number(sheet[`${g.key}Max`]) || 0));
  return Math.max(0, evalFormula(g.max, formulaVars(u, stats, sheet)));
}
export function skillBaseFor(u: Universe, stat: number, level: number, stats: Stats): number {
  return evalFormula(
    u.rules.skillBase,
    { ...formulaVars(u, stats), STAT: stat, NIV: level },
    stat + level,
  );
}
/** Jet de compétence à envoyer au serveur */
export function skillRoll(
  u: Universe,
  base: number,
): { count: number; sides: number; mod: number; target: number | null } {
  const { count, sides } = u.rules.skillDice;
  return u.rules.rollMode === "under"
    ? { count, sides, mod: 0, target: base }
    : { count, sides, mod: base, target: null };
}
/** Texte court du jet : « 1d10+7 » ou « 1d100 ≤ 45 » */
export function skillRollLabel(u: Universe, base: number) {
  const { count, sides } = u.rules.skillDice;
  return u.rules.rollMode === "under"
    ? `${count}d${sides} ≤ ${base}`
    : `${count}d${sides}${base >= 0 ? "+" : "−"}${Math.abs(base)}`;
}
export function skillDiceLabel(u: Universe) {
  const { count, sides } = u.rules.skillDice;
  return u.rules.rollMode === "under"
    ? `${count}d${sides} sous la base`
    : `${count}d${sides} + base`;
}
export function unarmedDamage(u: Universe, stats: Stats): string | null {
  if (!u.rules.unarmed) return null;
  const n = Math.max(1, evalFormula(u.rules.unarmed.count, formulaVars(u, stats), 1));
  return `${n}d${u.rules.unarmed.sides}`;
}

/* ------------------------------------------------------------------ */
/* Critiques et réussites                                              */
/* ------------------------------------------------------------------ */
export type RollOutcome = {
  dice_count: number;
  dice_sides: number;
  results: number[];
  total: number;
  target?: number | null;
};
const isSkillDie = (u: Universe, r: RollOutcome) =>
  r.dice_count === 1 &&
  r.dice_count === u.rules.skillDice.count &&
  r.dice_sides === u.rules.skillDice.sides;
const isDouble = (v: number) => v === 100 || (v >= 11 && v % 11 === 0);
function hits(rule: CritRule, r: RollOutcome, success: boolean | null, wantSuccess: boolean) {
  const v = r.results[0];
  if (v === undefined) return false;
  if (rule === "max") return v === r.dice_sides;
  if (rule === "min") return v === 1;
  if (rule === "doubles") return isDouble(v) && success === wantSuccess;
  return false;
}
/** Jet sous la base : réussite ? (null si le jet n'avait pas de cible) */
export function rollSuccess(r: RollOutcome): boolean | null {
  return r.target == null ? null : r.total <= r.target;
}
/** Degrés de réussite (positif) ou d'échec (négatif), façon jets de pourcentage */
export function rollDegrees(r: RollOutcome): number | null {
  if (r.target == null) return null;
  return Math.floor(r.target / 10) - Math.floor(r.total / 10);
}
export function isCritical(u: Universe, r: RollOutcome): boolean {
  if (!isSkillDie(u, r)) return false;
  const ok = rollSuccess(r);
  if (u.rules.crit === "doubles") return hits("doubles", r, ok, true);
  return hits(u.rules.crit, r, ok, true) && ok !== false;
}
export function isFumble(u: Universe, r: RollOutcome): boolean {
  if (!isSkillDie(u, r)) return false;
  const ok = rollSuccess(r);
  if (u.rules.fumble === "doubles") return hits("doubles", r, ok, false);
  return hits(u.rules.fumble, r, ok, false) && ok !== true;
}
export function critLabel(u: Universe, r: RollOutcome): string {
  const v = r.results[0];
  return u.rules.crit === "doubles" ? `DOUBLE ${v} · CRITIQUE` : `${v} NATUREL · CRITIQUE`;
}
export function fumbleLabel(u: Universe, r: RollOutcome): string {
  const v = r.results[0];
  return u.rules.fumble === "doubles"
    ? `DOUBLE ${v} · MALADRESSE`
    : `${v} NATUREL · ÉCHEC CRITIQUE`;
}

/** Classe d'affichage d'un dé : critique (vert), maladresse (rouge), max/min pour les jets classiques */
export function dieClass(u: Universe, r: RollOutcome, v: number): string {
  if (r.dice_count === 1) {
    if (isCritical(u, r)) return "max crit";
    if (isFumble(u, r)) return "min";
  }
  if (r.target != null) return "";
  return v === r.dice_sides ? "max" : v === 1 ? "min" : "";
}
/** Verdict d'un jet sous la base : « RÉUSSITE · +2 DR » */
export function rollVerdict(r: RollOutcome): { ok: boolean; text: string } | null {
  const ok = rollSuccess(r);
  if (ok === null) return null;
  const d = rollDegrees(r) ?? 0;
  return { ok, text: `${ok ? "RÉUSSITE" : "ÉCHEC"} · ${d >= 0 ? "+" : "−"}${Math.abs(d)} DR` };
}
