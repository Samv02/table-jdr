import { createContext, useContext } from "react";
import { DEFAULT_UNIVERSE, type Universe } from "./universe";

export type UniverseState = {
  universe: Universe;
  /** Univers enregistré, sans l'aperçu en cours : référence pour savoir si un brouillon a changé */
  saved: Universe;
  /** Enregistre l'univers pour toute la table (MJ uniquement, vérifié par la base) */
  save: (next: Universe) => Promise<string | null>;
  /** Aperçu local (page Univers) : appliqué à l'écran du MJ sans rien enregistrer ; null = revenir à l'univers enregistré */
  preview: (next: Universe | null) => void;
};

// Contexte hors du module composant (Fast Refresh) — même principe que table-context.
export const UniverseContext = createContext<UniverseState | null>(null);

const fallback: UniverseState = {
  universe: DEFAULT_UNIVERSE,
  saved: DEFAULT_UNIVERSE,
  save: async () => "Univers indisponible",
  preview: () => {},
};

/** Univers actif. Sans fournisseur (tests de composants), l'univers neutre est utilisé. */
export function useUniverse(): UniverseState {
  return useContext(UniverseContext) ?? fallback;
}
export const useWords = () => useUniverse().universe.words;
