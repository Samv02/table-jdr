import type { Universe } from "./universe";

/** Sommaire de MJ → Univers : une page par sujet, dans l'ordre où on règle une table. */
export type UniversePage = {
  id: string;
  title: string;
  hint: string;
  /** Mots qu'un MJ peut chercher sans connaître le titre */
  keywords: string;
  /** Part de l'univers réglée par cette page */
  value: (u: Universe) => unknown;
  /** Clés d'erreur de formule qui concernent cette page */
  errors?: RegExp;
};

export const UNIVERSE_GROUPS: { title: string; pages: UniversePage[] }[] = [
  {
    title: "Pour commencer",
    pages: [
      {
        id: "modele",
        title: "Modèle de départ",
        hint: "Choisis le jeu le plus proche du tien. Tout le reste part de là et reste modifiable.",
        keywords: "preset jeu cyberpunk fantasy horreur grimdark neutre thème",
        value: (u) => u.preset,
      },
      {
        id: "identite",
        title: "Nom de la table",
        hint: "Ce que tes joueurs voient en arrivant.",
        keywords: "titre sous-titre accroche",
        value: (u) => [u.words.tableName, u.words.tagline],
      },
    ],
  },
  {
    title: "Apparence",
    pages: [
      {
        id: "couleurs",
        title: "Couleurs et polices",
        hint: "L’écran change en direct : essaie, personne d’autre ne le voit avant l’enregistrement.",
        keywords: "fond texte police typographie palette",
        value: (u) => [
          u.theme.bg,
          u.theme.panel,
          u.theme.text,
          u.theme.mute,
          u.theme.cyan,
          u.theme.pink,
          u.theme.yellow,
          u.theme.red,
          u.theme.green,
          u.theme.violet,
          u.theme.fontBody,
          u.theme.fontDisplay,
          u.theme.fontMono,
        ],
      },
      {
        id: "decor",
        title: "Décor et effets",
        hint: "L’ambiance de la table : santé, cadres, fond animé, lueurs.",
        keywords: "visuel coins parchemin pluie braises brume étoiles néon scanlines animation",
        value: (u) => [
          u.theme.hpVisual,
          u.theme.corners,
          u.theme.atmosphere,
          u.theme.glow,
          u.theme.scanlines,
        ],
      },
    ],
  },
  {
    title: "Règles du jeu",
    pages: [
      {
        id: "stats",
        title: "Caractéristiques",
        hint: "Les grandes valeurs d’un personnage, comme la Force ou le Réflexe.",
        keywords: "caracs force code attributs",
        value: (u) => u.rules.stats,
        errors: /^stats$/,
      },
      {
        id: "jets",
        title: "Jets de dés",
        hint: "Comment un personnage réussit ce qu’il tente.",
        keywords: "dé d20 d100 d10 critique échec base réussite pourcentage",
        value: (u) => [
          u.rules.skillDice,
          u.rules.rollMode,
          u.rules.skillBase,
          u.rules.crit,
          u.rules.fumble,
        ],
        errors: /^skillBase$/,
      },
      {
        id: "sante",
        title: "Santé et jauges",
        hint: "Combien de coups on encaisse, et ce qu’on suit en plus : mana, santé mentale…",
        keywords: "pv points de vie blessure mort mana humanité sanité ressources",
        value: (u) => [u.rules.hpMax, u.rules.woundedAt, u.rules.deathSave, u.rules.gauges],
        errors: /^(hpMax|woundedAt|deathSave|gauge\d*)$/,
      },
      {
        id: "combat",
        title: "Combat",
        hint: "Ce qui sert aux attaques quand une arme n’a pas de compétence associée.",
        keywords: "armes mains nues distance mêlée tir automatique dégâts",
        value: (u) => [u.rules.rangedStat, u.rules.meleeStat, u.rules.autofire, u.rules.unarmed],
        errors: /^unarmed$/,
      },
    ],
  },
  {
    title: "Contenu de la table",
    pages: [
      {
        id: "competences",
        title: "Compétences",
        hint: "Prépare-les une fois : sur chaque fiche, elles s’ajoutent d’un clic et leur dé se calcule seul.",
        keywords: "bibliothèque liste ordre",
        value: (u) => [u.rules.skillLibrary, u.rules.skillOrder],
        errors: /^skillLibrary$/,
      },
      {
        id: "catalogue",
        title: "Catalogue",
        hint: "Armes, objets et pouvoirs, avec leur prix, leur dé et leurs effets.",
        keywords: "boutique objets armes pouvoirs prix effets items",
        value: () => null,
      },
      {
        id: "depart",
        title: "Fiche de départ",
        hint: "Ce que reçoit chaque nouveau personnage. Les fiches existantes ne changent pas.",
        keywords: "template modèle nouveau personnage argent",
        value: (u) => u.template,
      },
      {
        id: "blocs",
        title: "Contenu de la fiche",
        hint: "Ce qui apparaît sur les fiches : blocs activés, défenses et champs sous le nom.",
        keywords: "modules munitions argent emplacements boutique défenses armure classe niveau",
        value: (u) => [u.modules, u.rules.defenses, u.rules.infoFields],
      },
      {
        id: "mots",
        title: "Vocabulaire",
        hint: "Les mots affichés partout. Remplace « PV » par « Blessures » si ton jeu le dit ainsi.",
        keywords: "mots textes renommer traduction libellés",
        value: (u) => Object.entries(u.words).filter(([k]) => k !== "tableName" && k !== "tagline"),
      },
    ],
  },
];

export const UNIVERSE_PAGES = UNIVERSE_GROUPS.flatMap((g) => g.pages);
export const FIRST_PAGE = "modele";
export const universePage = (id: string | undefined) =>
  UNIVERSE_PAGES.find((p) => p.id === id) ?? (UNIVERSE_PAGES[0] as UniversePage);

export const pageChanged = (p: UniversePage, draft: Universe, saved: Universe) =>
  JSON.stringify(p.value(draft)) !== JSON.stringify(p.value(saved));

export const pageErrors = (p: UniversePage, errors: Record<string, string>) =>
  p.errors ? Object.keys(errors).filter((k) => p.errors?.test(k)).length : 0;

/** Recherche sans tenir compte des accents ni des majuscules. */
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function searchPages(query: string) {
  const q = plain(query.trim());
  if (!q) return UNIVERSE_PAGES;
  return UNIVERSE_PAGES.filter((p) => plain(`${p.title} ${p.hint} ${p.keywords}`).includes(q));
}
