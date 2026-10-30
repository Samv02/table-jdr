import { createContext, useContext } from "react";
import type { Music } from "./table";

export type Scene = {
  id: string;
  name: string;
  subtitle: string;
  image_path: string;
  sort_order: number;
  url?: string | null | undefined;
};
export type PartyMember = {
  character_id: string;
  handle: string;
  avatar_url: string | null;
  color: string;
  avatar?: string | null | undefined;
};
export type TableState = {
  scenes: Scene[];
  activeScene: Scene | null;
  music: Music;
  party: PartyMember[];
  online: Set<string>;
  clean: boolean;
  toggleClean: () => void;
  refresh: () => Promise<void>;
  serverNow: () => number;
};

// Keep context identity outside the Fast Refresh component module.
export const TableContext = createContext<TableState | null>(null);

export function useTable() {
  const value = useContext(TableContext);
  if (!value) throw new Error("Table provider missing");
  return value;
}
