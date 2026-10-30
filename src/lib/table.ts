export type Track = {
  video_id: string;
  title: string;
  duration: number;
  tag?: string | undefined;
  broken?: boolean | undefined;
};
export type LoopMode = "off" | "one" | "all";
/** Rampe de volume partagée : de `from` à `to` en `dur` ms, à partir de started_at (horloge serveur). */
export type MusicFade = { from: number; to: number; dur: number };
export type Music = {
  source_type?: "video" | "playlist";
  source_id?: string | undefined;
  index?: number;
  is_playing?: boolean;
  position_sec?: number;
  started_at?: string;
  volume?: number;
  queue?: Track[];
  loop?: LoopMode;
  shuffle?: boolean;
  crossfade_sec?: number;
  fade?: MusicFade | undefined;
  duck?: boolean;
  /** Ambiance en cours : l'enchaînement reste dans cette ambiance ("*" = toute la bibliothèque) */
  context?: string | undefined;
  /** Piste demandée "à la suite" par le MJ (identifiant vidéo), prioritaire au prochain enchaînement */
  next_up?: string | undefined;
};
export function expectedPosition(m: Music, serverNow: number) {
  return Math.max(
    0,
    (m.position_sec ?? 0) +
      (m.is_playing && m.started_at
        ? Math.max(0, (serverNow - Date.parse(m.started_at)) / 1000)
        : 0),
  );
}
export function parseYoutube(
  raw: string,
): { source_type: "video" | "playlist"; source_id: string } | null {
  try {
    const u = new URL(raw);
    if (
      ![
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "www.youtube-nocookie.com",
      ].includes(u.hostname)
    )
      return null;
    const list = u.searchParams.get("list");
    if (list && /^[\w-]+$/.test(list)) return { source_type: "playlist", source_id: list };
    const video =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1]);
    return video && /^[\w-]{11}$/.test(video) ? { source_type: "video", source_id: video } : null;
  } catch {
    return null;
  }
}
/** Extrait toutes les vidéos YouTube d'un texte collé (plusieurs liens séparés par des espaces ou des retours à la ligne). */
export function parseYoutubeList(raw: string): string[] {
  const ids: string[] = [];
  for (const part of raw.split(/\s+/)) {
    const p = parseYoutube(part.trim());
    if (p?.source_type === "video" && !ids.includes(p.source_id)) ids.push(p.source_id);
  }
  return ids;
}
export function validateScene(file: { size: number; type: string }) {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type))
    return "Choisis une image JPG, PNG, WebP ou GIF.";
  return file.size > 5 * 1024 * 1024 ? "L’image dépasse 5 Mo." : null;
}
export function sheetCanRoll(owner: string | null, user: string, isGm: boolean) {
  return !isGm && owner === user;
}
