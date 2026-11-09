/**
 * Scènes : transitions, ambiance, musique liée, ordre et dossiers.
 * Règles pures, sans affichage ni base, partagées par la page du MJ et les tests.
 */
import type { Music } from "@/lib/table";
import { WEATHERS, type Weather } from "@/lib/map-light";

export type Transition = "fade" | "cut" | "zoom" | "slide" | "blur" | "flash";
export const TRANSITIONS: { id: Transition; label: string; hint: string }[] = [
  { id: "fade", label: "Fondu", hint: "L’image apparaît doucement." },
  { id: "cut", label: "Direct", hint: "Changement immédiat, sans effet." },
  { id: "zoom", label: "Zoom", hint: "L’image arrive de loin et se rapproche." },
  { id: "slide", label: "Glissé", hint: "L’image glisse depuis la droite." },
  { id: "blur", label: "Mise au point", hint: "L’image sort du flou." },
  { id: "flash", label: "Éclair", hint: "Un flash blanc, pour un choc ou une révélation." },
];
/** Ambiances d'une scène : les mêmes que sur la carte. */
export const SCENE_AMBIANCES = WEATHERS;

/** Musique liée : une vidéo YouTube et son titre. */
export type SceneMusic = { video_id: string; title: string };

export const readTransition = (v: unknown): Transition =>
  TRANSITIONS.some((t) => t.id === v) ? (v as Transition) : "fade";
export const readAmbiance = (v: unknown): Weather =>
  WEATHERS.some((w) => w.id === v) ? (v as Weather) : "none";
export function readSceneMusic(v: unknown): SceneMusic | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const id = o["video_id"];
  if (typeof id !== "string" || !/^[\w-]{11}$/.test(id)) return null;
  const title = typeof o["title"] === "string" ? o["title"].slice(0, 120) : "";
  return { video_id: id, title };
}

/**
 * Musique de la table une fois la scène montrée : la piste liée se joue depuis le début.
 * Si elle est déjà dans la file, on s'y place ; sinon elle s'ajoute à la fin.
 */
export function musicForScene(current: Music, linked: SceneMusic): Music {
  const queue = [...(current.queue ?? [])];
  let index = queue.findIndex((t) => t.video_id === linked.video_id);
  if (index < 0) {
    queue.push({
      video_id: linked.video_id,
      title: linked.title || "Musique de la scène",
      duration: 0,
    });
    index = queue.length - 1;
  }
  const { fade: _fade, next_up: _next, ...rest } = current;
  return {
    ...rest,
    source_type: "video",
    source_id: linked.video_id,
    queue,
    index,
    is_playing: true,
    position_sec: 0,
  };
}

/** Nouvel ordre après avoir glissé l'élément `from` à la place de `to` (identifiants). */
export function reorder<T extends { id: string }>(list: T[], from: string, to: string): T[] {
  const a = list.findIndex((x) => x.id === from);
  const b = list.findIndex((x) => x.id === to);
  if (a < 0 || b < 0 || a === b) return list;
  const next = [...list];
  const [moved] = next.splice(a, 1);
  next.splice(b, 0, moved!);
  return next;
}

/** Positions à réécrire pour que la base suive l'ordre affiché : seulement celles qui changent. */
export function sortChanges(list: { id: string; sort_order: number }[]) {
  return list.flatMap((x, i) => (x.sort_order === i ? [] : [{ id: x.id, sort_order: i }]));
}

/** Nom lisible tiré d'un nom de fichier : « foret_sombre-02.jpg » → « Foret sombre 02 ». */
export function nameFromFile(file: string) {
  const base = file
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base ? base[0]!.toUpperCase() + base.slice(1) : "Nouvelle scène").slice(0, 120);
}

/** Dossiers utilisés, dans l'ordre alphabétique. */
export const foldersOf = (list: { folder: string }[]) =>
  [...new Set(list.map((s) => s.folder.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
