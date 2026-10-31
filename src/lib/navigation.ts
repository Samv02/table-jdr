/**
 * Plan de l'appli. Deux espaces : hors table (Mes tables, compte, aide) et à la table.
 * À la table, le MJ a ce qui sert pendant la partie, puis ce qui se prépare avant.
 */
export type TableTabIcon = "partie" | "scenes" | "musique" | "personnages" | "joueurs" | "univers";
export type TableTab = { to: string; label: string; icon: TableTabIcon };

export const GM_TABS: TableTab[][] = [
  [
    { to: "/mj/tableau", label: "Partie", icon: "partie" },
    { to: "/mj/scenes", label: "Scènes", icon: "scenes" },
    { to: "/mj/musique", label: "Musique", icon: "musique" },
  ],
  [
    { to: "/mj/personnages", label: "Personnages", icon: "personnages" },
    { to: "/mj/joueurs", label: "Joueurs", icon: "joueurs" },
    { to: "/mj/univers", label: "Univers", icon: "univers" },
  ],
];

/** Onglet allumé : la fiche ouverte par le MJ appartient à ses personnages. */
export const activeTab = (pathname: string, isGm: boolean) =>
  isGm && pathname === "/fiche" ? "/mj/personnages" : pathname;

export const OUTSIDE_TABS = [
  { to: "/tables", label: "Mes tables" },
  { to: "/profil", label: "Mon compte" },
  { to: "/support", label: "Aide" },
] as const;
