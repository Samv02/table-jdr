import { expectedPosition, type Music, type Track } from "./table";

/** Metadata must never take a loading iframe's zero as the shared playhead. */
export function musicMetadataUpdate(
  m: Music,
  video: { video_id?: string; title?: string },
  duration: number,
  serverNow: number,
  playlist?: { ids: string[]; index: number; position: number },
): Music | null {
  if (!video.video_id || !video.title || duration <= 0) return null;
  const index = m.source_type === "playlist" ? (playlist?.index ?? -1) : (m.index ?? 0);
  if (
    index < 0 ||
    (m.source_type === "playlist"
      ? playlist?.ids[index] !== video.video_id
      : video.video_id !== m.source_id)
  )
    return null;
  const old = m.queue?.[index];
  if (old?.video_id === video.video_id && old.title === video.title && old.duration === duration)
    return null;
  const queue =
    m.source_type === "playlist"
      ? (playlist?.ids ?? []).map(
          (id) =>
            m.queue?.find((track) => track.video_id === id) ?? {
              video_id: id,
              title: id,
              duration: 0,
            },
        )
      : [...(m.queue ?? [])];
  queue[index] = { ...queue[index], video_id: video.video_id, title: video.title, duration };
  return {
    ...m,
    queue,
    index,
    position_sec:
      index === (m.index ?? 0) ? expectedPosition(m, serverNow) : (playlist?.position ?? 0),
  };
}

/* ======================= Volume partagé (fondus) ======================= */

/** Volume du MJ à l'instant `serverNow`, en tenant compte d'un fondu en cours. */
export function gmVolumeAt(m: Music, serverNow: number): number {
  const master = clampVol(m.volume ?? 50);
  const f = m.fade;
  if (!f || !m.started_at) return master;
  const t =
    f.dur <= 0 ? 1 : Math.min(1, Math.max(0, (serverNow - Date.parse(m.started_at)) / f.dur));
  return clampVol(f.from + (f.to - f.from) * t);
}
export function fadeActive(m: Music, serverNow: number): boolean {
  return !!m.fade && !!m.started_at && serverNow < Date.parse(m.started_at) + m.fade.dur;
}
/**
 * Chaque écriture remet started_at à "maintenant" : un fondu recopié tel quel redémarrerait.
 * On le recale donc sur sa valeur actuelle (ou on le supprime s'il est fini et revenu au volume normal).
 */
export function rebaseFade(prev: Music, next: Music, serverNow: number): Music {
  if (!next.fade || next.fade !== prev.fade) return next;
  const f = prev.fade!;
  const end = prev.started_at ? Date.parse(prev.started_at) + f.dur : 0;
  const remaining = Math.max(0, end - serverNow);
  const out = { ...next };
  if (remaining === 0 && clampVol(f.to) === clampVol(next.volume ?? 50)) delete out.fade;
  else out.fade = { from: gmVolumeAt(prev, serverNow), to: f.to, dur: remaining };
  return out;
}
const clampVol = (v: number) => Math.round(Math.max(0, Math.min(100, v)));

/* ======================= Enchaînement des pistes ======================= */

/** Pistes jouables dans l'ambiance en cours (les vidéos indisponibles sont ignorées) */
export function contextIndexes(m: Music): number[] {
  const q = m.queue ?? [];
  const ctx = m.context;
  const all = q.map((t, i) => ({ t, i })).filter((x) => !x.t.broken);
  const inCtx = !ctx || ctx === "*" ? all : all.filter((x) => (x.t.tag ?? "") === ctx);
  return (inCtx.length ? inCtx : all).map((x) => x.i);
}

/**
 * Piste suivante.
 *  - auto = fin naturelle de la piste :
 *      loop "off"  → on s'arrête (null)
 *      loop "one"  → on rejoue la même
 *      loop "all"  → on enchaîne dans l'ambiance en cours, en boucle
 *  - manuel (boutons suivant / précédent) : on avance dans l'ambiance en cours
 *  - "Lire ensuite" (next_up) passe avant tout, l'aléatoire tire au sort dans l'ambiance.
 */
export function nextIndex(
  m: Music,
  opts: { dir?: 1 | -1; auto?: boolean; rand?: () => number } = {},
): number | null {
  const q = m.queue ?? [];
  if (!q.length) return null;
  const i = m.index ?? 0;
  const dir = opts.dir ?? 1;
  if (opts.auto && m.loop === "one") return i;
  if (opts.auto && (m.loop ?? "off") === "off" && !m.next_up) return null;
  if (dir === 1 && m.next_up) {
    const k = q.findIndex((t) => t.video_id === m.next_up && !t.broken);
    if (k >= 0 && k !== i) return k;
  }
  const cands = contextIndexes(m);
  if (!cands.length) return null;
  if (m.shuffle && dir === 1 && cands.length > 1) {
    const rand = opts.rand ?? Math.random;
    let j = i;
    for (let k = 0; k < 8 && j === i; k++) j = cands[Math.floor(rand() * cands.length)]!;
    return j === i ? cands.find((c) => c !== i)! : j;
  }
  const pos = cands.indexOf(i);
  if (pos < 0)
    return dir === 1
      ? (cands.find((c) => c > i) ?? (m.loop === "all" ? cands[0]! : null))
      : ([...cands].reverse().find((c) => c < i) ?? null);
  const nx = pos + dir;
  if (nx >= 0 && nx < cands.length) return cands[nx]!;
  return m.loop === "all" || !opts.auto
    ? m.loop === "all"
      ? cands[(nx + cands.length) % cands.length]!
      : null
    : null;
}

/** Piste au hasard ayant cette ambiance (évite celle en cours si possible). */
export function pickByTag(m: Music, tag: string, rand: () => number = Math.random): number | null {
  const all = (m.queue ?? [])
    .map((t, i) => ({ t, i }))
    .filter((x) => (x.t.tag ?? "") === tag && !x.t.broken);
  if (!all.length) return null;
  const others = all.filter((x) => x.i !== (m.index ?? 0));
  const pool = others.length ? others : all;
  return pool[Math.floor(rand() * pool.length)]!.i;
}

/* ======================= Édition de la file (mode vidéos) ======================= */

export function moveTrack(m: Music, from: number, to: number): Music {
  const q = [...(m.queue ?? [])];
  if (from < 0 || from >= q.length || to < 0 || to >= q.length || from === to) return m;
  const [t] = q.splice(from, 1);
  q.splice(to, 0, t!);
  const cur = m.index ?? 0;
  const index =
    cur === from ? to : from < cur && to >= cur ? cur - 1 : from > cur && to <= cur ? cur + 1 : cur;
  return { ...m, queue: q, index };
}
export function removeTrack(m: Music, at: number): Music {
  const q = [...(m.queue ?? [])];
  const cur = m.index ?? 0;
  if (at < 0 || at >= q.length || at === cur) return m;
  q.splice(at, 1);
  return { ...m, queue: q, index: at < cur ? cur - 1 : cur };
}
export function insertTracks(m: Music, tracks: Track[], where: "end" | "next"): Music {
  const q = [...(m.queue ?? [])];
  const known = new Set(q.map((t) => t.video_id));
  const fresh = tracks.filter((t) => !known.has(t.video_id));
  if (!fresh.length) return m;
  const at = where === "next" && q.length ? (m.index ?? 0) + 1 : q.length;
  q.splice(at, 0, ...fresh);
  return { ...m, queue: q };
}
export function tagTrack(m: Music, at: number, tag: string | undefined): Music {
  return {
    ...m,
    queue: (m.queue ?? []).map((t, i) => (i === at ? { ...t, tag: tag || undefined } : t)),
  };
}

/** Marque une piste comme indisponible (vidéo privée, supprimée, bloquée à l'intégration) */
export function markBroken(m: Music, videoId: string): Music {
  return {
    ...m,
    queue: (m.queue ?? []).map((t) => (t.video_id === videoId ? { ...t, broken: true } : t)),
  };
}
/** Une playlist YouTube devient une bibliothèque modifiable (chaque vidéo = une piste) */
export function playlistToLibrary(m: Music): Music {
  if (m.source_type !== "playlist") return m;
  const cur = m.queue?.[m.index ?? 0];
  return { ...m, source_type: "video", source_id: cur?.video_id, context: m.context ?? "*" };
}
