import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  Compass,
  CornerDownRight,
  Disc3,
  Heart,
  Infinity as InfinityIcon,
  Library,
  Link2,
  ListPlus,
  Martini,
  Moon,
  Music2,
  Search,
  Skull,
  Square,
  Swords,
  Zap,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Maximize2,
  Mic,
  Minus,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { youtubeTitles } from "@/lib/youtube.functions";
import { Button } from "./ui/button";
import { useTable } from "@/lib/table-context";
import { useIdentity } from "@/lib/active-character";
import {
  expectedPosition,
  parseYoutube,
  parseYoutubeList,
  type Music,
  type Track,
} from "@/lib/table";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
import {
  contextIndexes,
  fadeActive,
  gmVolumeAt,
  markBroken,
  playlistToLibrary,
  insertTracks,
  moveTrack,
  musicMetadataUpdate,
  nextIndex,
  pickByTag,
  rebaseFade,
  removeTrack,
  tagTrack,
} from "@/lib/music-playback";
import { confirmAction } from "@/components/ConfirmDialog";
type Player = {
  loadVideoById: (id: string, start?: number) => void;
  cueVideoById: (id: string, start?: number) => void;
  loadPlaylist: (options: {
    list: string;
    listType: string;
    index: number;
    startSeconds: number;
  }) => void;
  cuePlaylist: (options: {
    list: string;
    listType: string;
    index: number;
    startSeconds: number;
  }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (n: number, allow: boolean) => void;
  setVolume: (n: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoData: () => { video_id?: string; title?: string };
  getPlaylist: () => string[];
  getPlaylistIndex: () => number;
  destroy: () => void;
};
const playerMethods = [
  "loadVideoById",
  "cueVideoById",
  "loadPlaylist",
  "cuePlaylist",
  "playVideo",
  "pauseVideo",
  "seekTo",
  "setVolume",
  "getCurrentTime",
  "getDuration",
  "getVideoData",
  "getPlaylist",
  "getPlaylistIndex",
] as const;
function hasPlayerApi(p: Player | null): p is Player {
  return p !== null && playerMethods.every((method) => typeof p[method] === "function");
}
declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, options: Record<string, unknown>) => Player };
    onYouTubeIframeAPIReady?: () => void;
  }
}
type MusicContext = {
  update: (next: Music) => Promise<void>;
  position: () => number;
  duration: number;
  current: () => Music;
  busy: boolean;
  transitionTo: (index: number, extra?: Partial<Music>) => Promise<void>;
  stopNow: () => Promise<void>;
  importPlaylist: (listId: string) => Promise<string[]>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (sec: number) => Promise<void>;
  fadeStop: () => Promise<void>;
  toggleDuck: () => Promise<void>;
  playTag: (tag: string) => Promise<void>;
};
/** Volume de la musique quand le MJ parle (bouton Voix) */
export const DUCK_RATIO = 0.3;
/** Prépare l'écriture qui lance la piste `i` depuis le début */
function trackPatch(m: Music, i: number): Music {
  const t = m.queue?.[i];
  return {
    ...m,
    index: i,
    source_id: m.source_type === "playlist" ? m.source_id : t?.video_id,
    position_sec: 0,
    is_playing: true,
    // "Lire ensuite" est consommé quand la piste demandée démarre
    next_up: m.next_up && m.next_up === t?.video_id ? undefined : m.next_up,
  };
}
const Context = createContext<MusicContext | null>(null);

/* Réglages LOCAUX du lecteur (propres à chaque appareil, jamais envoyés au serveur) */
type WidgetPrefs = {
  collapsed?: boolean;
  volume?: number;
  muted?: boolean;
  pos?: { x: number; y: number } | null;
};
const PREFS_KEY = "nc-music-widget";
function readPrefs(): WidgetPrefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as WidgetPrefs;
  } catch {
    return {};
  }
}
function writePrefs(p: WidgetPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible : on garde en mémoire */
  }
}
/** Volume réellement appliqué : volume du MJ × volume personnel, ou 0 si coupé localement. */
export function effectiveVolume(gmVolume: number | undefined, localVolume: number, muted: boolean) {
  if (muted) return 0;
  const gm = Math.max(0, Math.min(100, gmVolume ?? 50));
  const local = Math.max(0, Math.min(100, localVolume));
  return Math.round((gm * local) / 100);
}
export function TableMusic({ children }: { children: ReactNode }) {
  const table = useTable();
  const id = useIdentity();
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const tableRef = useRef(table);
  tableRef.current = table;
  const gmRef = useRef(id.isGm);
  gmRef.current = id.isGm;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const loaded = useRef("");
  const [mounted, setMounted] = useState(false);
  const readyPlayer = useRef<Player | null>(null);
  // Lecteur flottant : réduit/agrandi, position, volume perso — le lecteur YouTube n'est JAMAIS détruit par ces réglages
  const [prefs] = useState(readPrefs);
  const [collapsed, setCollapsed] = useState(prefs.collapsed ?? false);
  const [localVol, setLocalVol] = useState(prefs.volume ?? 100);
  const [muted, setMuted] = useState(prefs.muted ?? false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(prefs.pos ?? null);
  const localVolRef = useRef(localVol);
  localVolRef.current = localVol;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const box = useRef<HTMLDivElement>(null);
  useEffect(
    () => writePrefs({ collapsed, volume: localVol, muted, pos }),
    [collapsed, localVol, muted, pos],
  );
  useEffect(() => setMounted(true), []);
  const lastMeta = useRef("");
  async function update(next: Music) {
    // Un fondu recopié tel quel redémarrerait (started_at est remis à zéro à chaque écriture) : on le recale
    const payload = rebaseFade(tableRef.current.music, next, tableRef.current.serverNow());
    if (payload.fade === undefined) delete payload.fade;
    const { error } = await supabase.rpc("set_table_music", { payload: payload as Json });
    if (error) toast.error(error.message);
    else await table.refresh();
  }
  const updateRef = useRef(update);
  updateRef.current = update;
  function sync() {
    const p = player.current;
    const m = tableRef.current.music;
    if (p !== readyPlayer.current || !hasPlayerApi(p) || !enabledRef.current || !m.source_id)
      return;
    const pos = expectedPosition(m, tableRef.current.serverNow());
    const key = `${m.source_type}:${m.source_id}:${m.index ?? 0}`;
    if (loaded.current !== key) {
      loaded.current = key;
      if (m.source_type === "playlist") {
        const opts = {
          list: m.source_id,
          listType: "playlist",
          index: m.index ?? 0,
          startSeconds: pos,
        };
        if (m.is_playing) p.loadPlaylist(opts);
        else p.cuePlaylist(opts);
      } else {
        if (m.is_playing) p.loadVideoById(m.source_id, pos);
        else p.cueVideoById(m.source_id, pos);
      }
    }
    p.setVolume(
      effectiveVolume(
        gmVolumeAt(m, tableRef.current.serverNow()),
        localVolRef.current,
        mutedRef.current,
      ),
    );
    if (Math.abs(p.getCurrentTime() - pos) > 2) p.seekTo(pos, true);
    if (m.is_playing) p.playVideo();
    else p.pauseVideo();
  }
  useEffect(() => {
    readyPlayer.current = null;
    setReady(false);
    enabledRef.current = false;
    setEnabled(false);
    setFailed(false);
    loaded.current = "";
    lastMeta.current = "";
    setDuration(0);
    if (!id.userId || !mounted) return;
    let stopped = false;
    const container = holder.current;
    const create = () => {
      if (stopped || !container || typeof window.YT?.Player !== "function" || player.current)
        return;
      const target = document.createElement("div");
      container.appendChild(target);
      player.current = new window.YT.Player(target, {
        width: 200,
        height: 200,
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            if (stopped || !hasPlayerApi(player.current)) return;
            readyPlayer.current = player.current;
            setReady(true);
          },
          onError: () => {
            if (stopped) return;
            setFailed(true);
            // Côté MJ : la piste est marquée indisponible et on passe automatiquement à la suivante
            const m = tableRef.current.music;
            if (gmRef.current && m.source_type !== "playlist" && m.source_id) {
              const marked = markBroken(m, m.source_id);
              const i = nextIndex(
                { ...marked, loop: marked.loop === "one" ? "one" : "all" },
                { auto: true },
              );
              window.setTimeout(() => {
                void updateRef.current(
                  i === null || i === (m.index ?? 0)
                    ? { ...marked, is_playing: false }
                    : trackPatch(marked, i),
                );
              }, 1200);
            }
          },
          onAutoplayBlocked: () => {
            if (stopped) return;
            enabledRef.current = false;
            setEnabled(false);
          },
          onStateChange: (event: { data: number }) => {
            const p = player.current;
            const m = tableRef.current.music;
            if (stopped || p !== readyPlayer.current || !hasPlayerApi(p)) return;
            if (event.data === 1) setFailed(false);
            const video = p.getVideoData();
            const duration = p.getDuration();
            setDuration(duration);
            if (
              gmRef.current &&
              (event.data === 1 || event.data === 2) &&
              video.video_id &&
              video.title &&
              duration > 0
            ) {
              const meta = `${video.video_id}:${video.title}:${duration}`;
              if (lastMeta.current !== meta) {
                lastMeta.current = meta;
                const next = musicMetadataUpdate(
                  m,
                  video,
                  duration,
                  tableRef.current.serverNow(),
                  m.source_type === "playlist"
                    ? {
                        ids: p.getPlaylist(),
                        index: p.getPlaylistIndex(),
                        position: p.getCurrentTime(),
                      }
                    : undefined,
                );
                if (next) void updateRef.current(next);
              }
            }
            if (
              event.data === 0 &&
              gmRef.current &&
              m.is_playing &&
              duration > 0 &&
              p.getCurrentTime() >= duration - 2 &&
              video.video_id ===
                (m.source_type === "playlist" ? m.queue?.[m.index ?? 0]?.video_id : m.source_id)
            ) {
              // Fin naturelle : boucle "piste", boucle "file", aléatoire, ou arrêt
              const i = nextIndex(m, { auto: true });
              const cs = m.crossfade_sec ?? 0;
              if (i === null)
                void updateRef.current({ ...m, is_playing: false, position_sec: duration });
              else if (i === (m.index ?? 0))
                void updateRef.current({ ...m, position_sec: 0, is_playing: true });
              else
                void updateRef.current({
                  ...trackPatch(m, i),
                  fade: cs > 0 ? { from: 0, to: m.volume ?? 50, dur: cs * 500 } : undefined,
                  duck: false,
                });
            }
          },
        },
      });
    };
    const previous = window.onYouTubeIframeAPIReady;
    const apiReady = () => {
      previous?.();
      create();
    };
    if (typeof window.YT?.Player === "function") create();
    else {
      window.onYouTubeIframeAPIReady = apiReady;
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.onerror = () => {
          if (!stopped) setFailed(true);
        };
        document.head.appendChild(script);
      }
    }
    return () => {
      stopped = true;
      readyPlayer.current = null;
      const p = player.current;
      player.current = null;
      if (typeof p?.destroy === "function") p.destroy();
      container?.replaceChildren();
      if (window.onYouTubeIframeAPIReady === apiReady) {
        if (previous) window.onYouTubeIframeAPIReady = previous;
        else delete window.onYouTubeIframeAPIReady;
      }
    };
  }, [id.userId, mounted]);
  useEffect(() => {
    if (!ready) return;
    sync();
    const interval = setInterval(sync, 5000);
    return () => clearInterval(interval);
  }, [ready, enabled, table.music]);
  // Volume perso appliqué tout de suite (sans attendre la synchro de 5 s)
  useEffect(() => {
    const p = readyPlayer.current;
    if (!ready || !enabled || !hasPlayerApi(p)) return;
    p.setVolume(
      effectiveVolume(
        gmVolumeAt(tableRef.current.music, tableRef.current.serverNow()),
        localVol,
        muted,
      ),
    );
  }, [ready, enabled, localVol, muted]);
  // Pendant un fondu, le volume est recalculé 10 fois par seconde chez chacun (une seule écriture côté serveur)
  useEffect(() => {
    if (!ready || !enabled || !fadeActive(table.music, table.serverNow())) return;
    const iv = setInterval(() => {
      const p = readyPlayer.current;
      const cur = tableRef.current.music;
      const t = tableRef.current.serverNow();
      if (hasPlayerApi(p))
        p.setVolume(effectiveVolume(gmVolumeAt(cur, t), localVolRef.current, mutedRef.current));
      if (!fadeActive(cur, t)) clearInterval(iv);
    }, 100);
    return () => clearInterval(iv);
  }, [ready, enabled, table.music]);
  // Actions du MJ : vivent dans le fournisseur (pas dans l'onglet) pour qu'un fondu en cours ne soit pas interrompu en changeant d'onglet
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const nowMs = () => tableRef.current.serverNow();
  const posNow = () => expectedPosition(tableRef.current.music, nowMs());
  const target = (m: Music) =>
    m.duck ? Math.round((m.volume ?? 50) * DUCK_RATIO) : (m.volume ?? 50);
  async function transitionTo(i: number, extra: Partial<Music> = {}) {
    const m = { ...tableRef.current.music, ...extra };
    if (!m.queue?.[i]) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const half = Math.max(0, m.crossfade_sec ?? 0) * 500;
    if (!half) {
      await update({ ...trackPatch(m, i), fade: undefined, duck: false });
      return;
    }
    if (!m.is_playing) {
      await update({
        ...trackPatch(m, i),
        fade: { from: 0, to: m.volume ?? 50, dur: half },
        duck: false,
      });
      return;
    }
    setBusy(true);
    await update({
      ...m,
      position_sec: posNow(),
      fade: { from: gmVolumeAt(m, nowMs()), to: 0, dur: half },
    });
    timer.current = setTimeout(() => {
      timer.current = null;
      const cur = tableRef.current.music;
      void update({
        ...trackPatch({ ...cur, ...extra }, i),
        fade: { from: 0, to: cur.volume ?? 50, dur: half },
        duck: false,
      }).finally(() => setBusy(false));
    }, half);
  }
  async function play() {
    const m = tableRef.current.music;
    const half = (m.crossfade_sec ?? 0) * 500;
    await update({
      ...m,
      is_playing: true,
      position_sec: posNow(),
      fade: half ? { from: 0, to: target(m), dur: half } : undefined,
    });
  }
  async function pause() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      setBusy(false);
    }
    const m = tableRef.current.music;
    await update({ ...m, is_playing: false, position_sec: posNow() });
  }
  async function seek(sec: number) {
    const m = tableRef.current.music;
    const d = m.queue?.[m.index ?? 0]?.duration || duration || Infinity;
    await update({ ...m, position_sec: Math.max(0, Math.min(sec, d)) });
  }
  async function fadeStop() {
    const m = tableRef.current.music;
    if (!m.is_playing) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    await update({
      ...m,
      position_sec: posNow(),
      fade: { from: gmVolumeAt(m, nowMs()), to: 0, dur: 2500 },
    });
    timer.current = setTimeout(() => {
      timer.current = null;
      void update({
        ...tableRef.current.music,
        is_playing: false,
        position_sec: posNow(),
        fade: undefined,
        duck: false,
      }).finally(() => setBusy(false));
    }, 2500);
  }
  async function toggleDuck() {
    const m = tableRef.current.music;
    const from = gmVolumeAt(m, nowMs());
    const duck = !m.duck;
    await update({
      ...m,
      position_sec: posNow(),
      duck,
      fade: {
        from,
        to: duck ? Math.round((m.volume ?? 50) * DUCK_RATIO) : (m.volume ?? 50),
        dur: 800,
      },
    });
  }
  /** Lance une ambiance : une piste au hasard de l'ambiance, puis enchaînement dans cette ambiance */
  async function playTag(tag: string) {
    const m = tableRef.current.music;
    const ctx = { ...m, context: tag };
    const i =
      tag === "*"
        ? (contextIndexes(ctx)[
            Math.floor(Math.random() * Math.max(1, contextIndexes(ctx).length))
          ] ?? null)
        : pickByTag(m, tag);
    if (i === null) return;
    await transitionTo(i, {
      context: tag,
      loop: m.loop === "one" ? "one" : "all",
      next_up: undefined,
    });
  }
  /** Arrêt immédiat (sans fondu) */
  async function stopNow() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      setBusy(false);
    }
    await update({
      ...tableRef.current.music,
      is_playing: false,
      position_sec: posNow(),
      fade: undefined,
      duck: false,
    });
  }
  /** Récupère les vidéos d'une playlist YouTube via un lecteur caché (sans clé d'API) */
  function importPlaylist(listId: string): Promise<string[]> {
    return new Promise((resolve) => {
      const YT = window.YT;
      if (typeof YT?.Player !== "function") return resolve([]);
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-10000px;top:0;width:200px;height:200px";
      const target = document.createElement("div");
      host.appendChild(target);
      document.body.appendChild(host);
      let done = false;
      const finish = (ids: string[]) => {
        if (done) return;
        done = true;
        try {
          tmp.destroy();
        } catch {
          /* déjà détruit */
        }
        host.remove();
        resolve(ids);
      };
      const tmp: Player = new YT.Player(target, {
        width: 200,
        height: 200,
        playerVars: {
          listType: "playlist",
          list: listId,
          controls: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            let tries = 0;
            const poll = () => {
              const ids = typeof tmp.getPlaylist === "function" ? tmp.getPlaylist() : [];
              if (ids?.length) return finish(ids);
              if (++tries > 30) return finish([]);
              window.setTimeout(poll, 250);
            };
            poll();
          },
          onError: () => finish([]),
        },
      });
      window.setTimeout(() => finish([]), 12000);
    });
  }
  // Garde le lecteur dans l'écran (redimensionnement, rotation du téléphone)
  const clamp = useCallback((x: number, y: number) => {
    const el = box.current;
    const w = el?.offsetWidth ?? 240;
    const hh = el?.offsetHeight ?? 60;
    return {
      x: Math.max(8, Math.min(window.innerWidth - w - 8, x)),
      y: Math.max(8, Math.min(window.innerHeight - hh - 8, y)),
    };
  }, []);
  useEffect(() => {
    if (!pos) return;
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos, clamp]);
  useEffect(() => {
    if (pos) setPos((p) => (p ? clamp(p.x, p.y) : p)); /* recale après réduction/agrandissement */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);
  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button,input")) return;
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    const move = (ev: PointerEvent) => setPos(clamp(ev.clientX - dx, ev.clientY - dy));
    const up = () => {
      el.classList.remove("dragging");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
  const enable = () => {
    enabledRef.current = true;
    setEnabled(true);
    sync();
  };
  const track = table.music.queue?.[table.music.index ?? 0];
  const title = failed ? "Vidéo indisponible" : (track?.title ?? "Musique");
  const audible = enabled && table.music.is_playing && !muted && localVol > 0;
  return (
    <Context.Provider
      value={{
        update,
        position: posNow,
        duration,
        current: () => tableRef.current.music,
        busy,
        transitionTo,
        play,
        pause,
        seek,
        fadeStop,
        toggleDuck,
        playTag,
        stopNow,
        importPlaylist,
      }}
    >
      {children}
      {mounted &&
        id.userId &&
        createPortal(
          <div
            ref={box}
            className={`music-widget cut-s ${table.music.source_id ? "has-track" : ""} ${collapsed ? "collapsed" : ""} ${table.clean ? "clean-hidden" : ""}`}
            style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
            aria-label="Lecteur de musique"
          >
            <div className="mw-head" onPointerDown={startDrag} title="Glisser pour déplacer">
              <GripHorizontal size={14} className="mw-grip" aria-hidden />
              <div className={`eq ${audible ? "" : "paused"}`} aria-hidden>
                <b />
                <b />
                <b />
                <b />
              </div>
              <span className="mw-title">{title}</span>
              {!enabled ? (
                collapsed && (
                  <Button
                    variant="prototype"
                    className="icon-btn mw-enable-mini"
                    aria-label="Activer le son"
                    title="Activer le son"
                    disabled={!ready || failed}
                    onClick={enable}
                  >
                    <Volume2 size={15} />
                  </Button>
                )
              ) : (
                <Button
                  variant="prototype"
                  className={`icon-btn ${muted ? "off" : ""}`}
                  aria-label={muted ? "Rétablir le son" : "Couper le son chez moi"}
                  title={muted ? "Rétablir le son" : "Couper le son chez moi"}
                  onClick={() => setMuted((v) => !v)}
                >
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </Button>
              )}
              <Button
                variant="prototype"
                className="icon-btn"
                aria-label={collapsed ? "Agrandir le lecteur" : "Réduire le lecteur"}
                title={collapsed ? "Agrandir" : "Réduire"}
                onClick={() => setCollapsed((v) => !v)}
              >
                {collapsed ? <Maximize2 size={14} /> : <Minus size={15} />}
              </Button>
            </div>
            {/* Le lecteur reste toujours monté ; réduit, il est simplement sorti de l'écran */}
            <div className="mw-video" ref={holder} />
            {!collapsed && (
              <div className="mw-body">
                {failed && <p className="note error">Vidéo indisponible</p>}
                {!enabled ? (
                  <Button
                    variant="prototype"
                    className="btn y mw-enable"
                    aria-label="Activer le son"
                    disabled={!ready || failed}
                    onClick={enable}
                  >
                    <Volume2 size={16} />
                    {failed ? "YouTube indisponible" : ready ? "Activer le son" : "Chargement…"}
                  </Button>
                ) : (
                  <div className="mw-vol">
                    <span>MON VOLUME</span>
                    <input
                      type="range"
                      aria-label="Mon volume"
                      min={0}
                      max={100}
                      value={localVol}
                      style={{ "--pct": `${localVol}%` } as CSSProperties}
                      onChange={(e) => {
                        setLocalVol(Number(e.target.value));
                        if (muted) setMuted(false);
                      }}
                    />
                    <b>{muted ? "0" : localVol}%</b>
                  </div>
                )}
                <p className="mw-note">
                  {id.isGm
                    ? "Ton écoute seulement. Le pilotage se fait dans MJ → Musique."
                    : "Musique pilotée par le MJ. Ce réglage ne change le son que chez toi."}
                </p>
              </div>
            )}
          </div>,
          document.body,
        )}
    </Context.Provider>
  );
}
export const MUSIC_TAGS = [
  "Exploration",
  "Combat",
  "Tension",
  "Boss",
  "Poursuite",
  "Taverne / Bar",
  "Calme",
  "Émotion",
] as const;
const TAG_ICON: Record<string, typeof Compass> = {
  Exploration: Compass,
  Combat: Swords,
  Tension: Activity,
  Boss: Skull,
  Poursuite: Zap,
  "Taverne / Bar": Martini,
  Calme: Moon,
  Émotion: Heart,
};
const TAG_HUE: Record<string, string> = {
  Exploration: "var(--cyan)",
  Combat: "var(--red)",
  Tension: "var(--orange)",
  Boss: "var(--violet)",
  Poursuite: "var(--yellow)",
  "Taverne / Bar": "var(--pink)",
  Calme: "var(--green)",
  Émotion: "color-mix(in srgb, var(--cyan) 50%, var(--violet))",
};
const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const END_MODES = [
  { loop: "off", label: "Arrêter", hint: "La musique s'arrête à la fin du morceau", Icon: Square },
  { loop: "one", label: "Répéter", hint: "Le même morceau tourne en boucle", Icon: Repeat1 },
  {
    loop: "all",
    label: "Enchaîner",
    hint: "Morceau suivant de la même ambiance, sans fin",
    Icon: InfinityIcon,
  },
] as const;
const FADES = [0, 2, 4, 8] as const;

/**
 * Panneau Musique du MJ.
 *  1. Lecteur : ce qui joue, contrôles, volume, voix, fondu.
 *  2. Fin du morceau : Arrêter / Répéter / Enchaîner (+ aléatoire) et type de transition.
 *  3. Ambiances : une tuile = lancer l'ambiance (musique continue dans cette ambiance).
 *  4. Bibliothèque : toutes les pistes, rangées par ambiance, avec Jouer / À la suite / Supprimer.
 *  5. Ajouter : coller des liens YouTube (vidéos ou playlist) et choisir leur ambiance.
 */
export function MusicManager() {
  const ctx = useContext(Context);
  const table = useTable();
  const musicRef = useRef(table.music);
  const fetchTitles = useServerFn(youtubeTitles);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(table.music.volume ?? 50);
  const seeking = useRef(false);
  const [filter, setFilter] = useState<string>("*");
  const [search, setSearch] = useState("");
  const [links, setLinks] = useState("");
  const [addTag, setAddTag] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const tried = useRef(new Set<string>());
  const converted = useRef(false);
  const addBox = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setVolume(table.music.volume ?? 50), [table.music.volume]);
  useEffect(() => {
    const tick = () => {
      if (!seeking.current) setPosition(ctx?.position() ?? 0);
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [ctx]);

  // Ancien mode "playlist YouTube" : converti une fois en bibliothèque modifiable
  useEffect(() => {
    if (!ctx || converted.current) return;
    const m = ctx.current();
    if (m.source_type === "playlist" && (m.queue?.length ?? 0) > 0) {
      converted.current = true;
      void ctx.update({ ...playlistToLibrary(m), position_sec: ctx.position() });
    }
  }, [ctx, table.music.source_type, table.music.queue?.length]);

  // Titres manquants récupérés automatiquement
  useEffect(() => {
    if (!ctx) return;
    const missing = (table.music.queue ?? [])
      .filter(
        (t) =>
          (!t.title || t.title === t.video_id || t.title === "Chargement…") &&
          !tried.current.has(t.video_id),
      )
      .map((t) => t.video_id);
    if (!missing.length) return;
    missing.forEach((id) => tried.current.add(id));
    void fetchTitles({ data: missing.slice(0, 50) })
      .then((titles) => {
        if (!Object.keys(titles).length) return;
        const cur = ctx.current();
        void ctx.update({
          ...cur,
          position_sec: ctx.position(),
          queue: (cur.queue ?? []).map((t) =>
            titles[t.video_id] && (t.title === t.video_id || !t.title || t.title === "Chargement…")
              ? { ...t, title: titles[t.video_id]! }
              : t,
          ),
        });
      })
      .catch(() => {});
  }, [ctx, table.music.queue, fetchTitles]);

  // Raccourcis clavier (hors champs de saisie)
  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.closest("input,textarea,select,[contenteditable=true]") ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey)
      )
        return;
      const m = ctx.current();
      const k = e.key.toLowerCase();
      if (k === " " && m.source_id) {
        e.preventDefault();
        void (m.is_playing ? ctx.pause() : ctx.play());
      } else if (k === "arrowleft" && m.source_id) {
        e.preventDefault();
        void ctx.seek(ctx.position() - 10);
      } else if (k === "arrowright" && m.source_id) {
        e.preventDefault();
        void ctx.seek(ctx.position() + 10);
      } else if (k === "n") {
        const i = nextIndex(m);
        if (i !== null) void ctx.transitionTo(i);
      } else if (k === "p") {
        const i = nextIndex(m, { dir: -1 });
        if (i !== null) void ctx.transitionTo(i);
      } else if (k === "v" && m.is_playing) void ctx.toggleDuck();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx]);

  musicRef.current = table.music;
  if (!ctx) return null;
  const m = table.music;
  const queue = m.queue ?? [];
  const index = m.index ?? 0;
  const current = m.source_id ? queue[index] : undefined;
  const loop = m.loop ?? "off";
  const cs = m.crossfade_sec ?? 0;
  const context = m.context ?? "*";
  const dur = Math.max(ctx.duration, current?.duration ?? 0, 1);
  const write = (next: Music) => ctx.update({ ...next, position_sec: ctx.position() });
  const count = (tag: string) => queue.filter((t) => (t.tag ?? "") === tag && !t.broken).length;
  const nextUp = m.next_up ? queue.find((t) => t.video_id === m.next_up) : undefined;
  const upcoming =
    loop === "one"
      ? current
      : (() => {
          const i = nextIndex({ ...m, shuffle: false }, { auto: loop !== "off" });
          return i === null ? undefined : queue[i];
        })();
  const shown = queue
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => filter === "*" || (filter === "" ? !t.tag : t.tag === filter))
    .filter(
      ({ t }) => !search.trim() || t.title.toLowerCase().includes(search.trim().toLowerCase()),
    );

  async function add() {
    const text = links.trim();
    if (!text || !ctx) return;
    setAdding(true);
    try {
      let ids = parseYoutubeList(text);
      const pl = parseYoutube(text);
      if (!ids.length && pl?.source_type === "playlist")
        ids = await ctx.importPlaylist(pl.source_id);
      if (!ids.length) return;
      const tracks: Track[] = ids.map((id) => ({
        video_id: id,
        title: id,
        duration: 0,
        tag: addTag || undefined,
      }));
      const base = playlistToLibrary(ctx.current());
      const next = insertTracks(base, tracks, "end");
      if (!base.source_id || !(base.queue ?? []).length) {
        const first = (next.queue ?? []).findIndex((t) => t.video_id === ids[0]);
        await ctx.update({
          ...next,
          source_type: "video",
          index: Math.max(0, first),
          source_id: ids[0],
          position_sec: 0,
          is_playing: false,
          volume: base.volume ?? 50,
          context: "*",
        });
      } else await write(next);
      setLinks("");
      if (addTag) setFilter(addTag);
    } finally {
      setAdding(false);
    }
  }
  function startAddFor(tag: string) {
    setAddTag(tag);
    setFilter(tag);
    addBox.current?.focus();
    addBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="mx">
      {/* ================= LECTEUR ================= */}
      <section className="panel cut mx-player">
        <div className="ph">
          <h2>Lecteur</h2>
          <span className={`tag live ${m.is_playing ? "on" : ""}`}>
            {m.is_playing ? "DIFFUSÉ À TOUS" : "EN PAUSE"}
          </span>
        </div>
        <div className="mx-now">
          <div className={`mx-cover ${m.is_playing ? "playing" : ""}`}>
            {current ? <img src={thumb(current.video_id)} alt="" /> : <Disc3 size={36} />}
            {current && m.is_playing && (
              <div className="eq">
                <b />
                <b />
                <b />
                <b />
              </div>
            )}
          </div>
          <div className="mx-info">
            <div className="mx-badges">
              {context !== "*" && (
                <span
                  className="mx-badge"
                  style={{ "--h": TAG_HUE[context] ?? "var(--cyan)" } as CSSProperties}
                >
                  {context}
                </span>
              )}
              {m.duck && <span className="mx-badge duck">VOIX</span>}
              {ctx.busy && <span className="mx-badge">TRANSITION…</span>}
            </div>
            <h4>{current?.title ?? "Aucune musique"}</h4>
            <p className="mx-next">
              {nextUp ? (
                <>
                  À la suite : <b>{nextUp.title}</b>
                </>
              ) : loop === "off" ? (
                "S'arrêtera à la fin du morceau"
              ) : loop === "one" ? (
                "Ce morceau sera répété"
              ) : m.shuffle ? (
                `Ensuite : un morceau au hasard (${context === "*" ? "toute la bibliothèque" : context})`
              ) : upcoming ? (
                <>
                  Ensuite : <b>{upcoming.title}</b>
                </>
              ) : (
                "Fin de l'ambiance"
              )}
            </p>
          </div>
        </div>
        <div className="seek">
          <span>{fmt(position)}</span>
          <input
            type="range"
            aria-label="Position"
            disabled={!m.source_id}
            min={0}
            max={dur}
            value={Math.min(position, dur)}
            style={{ "--pct": `${Math.min(100, (position / dur) * 100)}%` } as CSSProperties}
            onPointerDown={() => {
              seeking.current = true;
            }}
            onChange={(e) => {
              seeking.current = true;
              setPosition(Number(e.target.value));
            }}
            onPointerUp={(e) => {
              seeking.current = false;
              void ctx.seek(Number(e.currentTarget.value));
            }}
            onKeyUp={(e) => {
              seeking.current = false;
              void ctx.seek(Number(e.currentTarget.value));
            }}
          />
          <span>{fmt(ctx.duration || current?.duration || 0)}</span>
        </div>
        <div className="mx-transport">
          <Button
            variant="prototype"
            className="mx-t small"
            title="−10 s (←)"
            aria-label="Reculer de 10 secondes"
            disabled={!m.source_id}
            onClick={() => void ctx.seek(ctx.position() - 10)}
          >
            <RotateCcw />
          </Button>
          <Button
            variant="prototype"
            className="mx-t"
            title="Morceau précédent (P)"
            aria-label="Précédent"
            disabled={nextIndex(m, { dir: -1 }) === null || ctx.busy}
            onClick={() => {
              const i = nextIndex(m, { dir: -1 });
              if (i !== null) void ctx.transitionTo(i);
            }}
          >
            <SkipBack />
          </Button>
          <Button
            variant="prototype"
            className="mx-t play"
            title="Lecture / pause (Espace)"
            aria-label={m.is_playing ? "Pause" : "Lecture"}
            disabled={!m.source_id}
            onClick={() => void (m.is_playing ? ctx.pause() : ctx.play())}
          >
            {m.is_playing ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="prototype"
            className="mx-t"
            title="Morceau suivant (N)"
            aria-label="Suivant"
            disabled={nextIndex(m) === null || ctx.busy}
            onClick={() => {
              const i = nextIndex(m);
              if (i !== null) void ctx.transitionTo(i);
            }}
          >
            <SkipForward />
          </Button>
          <Button
            variant="prototype"
            className="mx-t small"
            title="+10 s (→)"
            aria-label="Avancer de 10 secondes"
            disabled={!m.source_id}
            onClick={() => void ctx.seek(ctx.position() + 10)}
          >
            <RotateCw />
          </Button>
        </div>
        <div className="mx-vol">
          <Volume2 size={18} />
          <input
            aria-label="Volume pour toute la table"
            type="range"
            min={0}
            max={100}
            value={volume}
            style={{ "--pct": `${volume}%` } as CSSProperties}
            onChange={(e) => setVolume(Number(e.target.value))}
            onPointerUp={(e) =>
              void write({
                ...m,
                volume: Number(e.currentTarget.value),
                fade: undefined,
                duck: false,
              })
            }
            onKeyUp={(e) =>
              void write({
                ...m,
                volume: Number(e.currentTarget.value),
                fade: undefined,
                duck: false,
              })
            }
          />
          <b>{volume}%</b>
        </div>
        <div className="mx-quick">
          <Button
            variant="prototype"
            className={`mx-q ${m.duck ? "on duck" : ""}`}
            title={`Baisse la musique à ${Math.round(DUCK_RATIO * 100)} % pendant que tu parles (V)`}
            aria-pressed={!!m.duck}
            disabled={!m.is_playing}
            onClick={() => void ctx.toggleDuck()}
          >
            <Mic size={16} />
            {m.duck ? "Voix : ON" : "Voix"}
          </Button>
          <Button
            variant="prototype"
            className="mx-q"
            title="Baisse doucement puis met en pause"
            disabled={ctx.busy || !m.is_playing}
            onClick={() => void ctx.fadeStop()}
          >
            <Volume2 size={16} />
            Fondu & stop
          </Button>
          <Button
            variant="prototype"
            className="mx-q red"
            title="Coupe immédiatement"
            disabled={!m.is_playing}
            onClick={() => void ctx.stopNow()}
          >
            <Square size={14} />
            Couper
          </Button>
        </div>

        <div className="mx-block">
          <h5>À la fin du morceau</h5>
          <div className="mx-seg" role="radiogroup" aria-label="À la fin du morceau">
            {END_MODES.map(({ loop: l, label, hint, Icon }) => (
              <button
                type="button"
                key={l}
                role="radio"
                aria-checked={loop === l}
                title={hint}
                className={loop === l ? "on" : ""}
                onClick={() => void write({ ...m, loop: l })}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <label
            className={`mx-toggle ${loop !== "all" ? "dim" : ""}`}
            title="En mode Enchaîner : morceau suivant tiré au hasard dans l'ambiance"
          >
            <input
              type="checkbox"
              checked={!!m.shuffle}
              onChange={(e) => void write({ ...m, shuffle: e.target.checked })}
            />
            <i />
            <Shuffle size={14} /> Ordre aléatoire
          </label>
        </div>
        <div className="mx-block">
          <h5>Transition entre morceaux</h5>
          <div className="mx-seg" role="radiogroup" aria-label="Transition">
            {FADES.map((s) => (
              <button
                type="button"
                key={s}
                role="radio"
                aria-checked={cs === s}
                className={cs === s ? "on" : ""}
                onClick={() => void write({ ...m, crossfade_sec: s })}
              >
                {s ? `Fondu ${s} s` : "Coupe nette"}
              </button>
            ))}
          </div>
        </div>
        <p className="note shortcuts">
          Raccourcis : <kbd>Espace</kbd> lecture/pause · <kbd>←</kbd>
          <kbd>→</kbd> ±10 s · <kbd>N</kbd>/<kbd>P</kbd> suivant/précédent · <kbd>V</kbd> voix
        </p>
      </section>

      {/* ================= AMBIANCES ================= */}
      <section className="panel cut mx-moods">
        <div className="ph">
          <h2>Ambiances</h2>
          <span className="tag">UN CLIC = LA MUSIQUE CHANGE POUR TOUS</span>
        </div>
        <div className="mx-tiles">
          {MUSIC_TAGS.map((tag) => {
            const Icon = TAG_ICON[tag] ?? Music2;
            const n = count(tag);
            const live = context === tag && m.is_playing;
            return (
              <button
                type="button"
                key={tag}
                className={`mx-tile ${live ? "live" : ""} ${n ? "" : "empty"}`}
                style={{ "--h": TAG_HUE[tag] } as CSSProperties}
                title={
                  n
                    ? `Lancer l'ambiance ${tag} (${n} morceau${n > 1 ? "x" : ""})`
                    : `Aucun morceau ${tag} : clique pour en ajouter`
                }
                disabled={ctx.busy}
                onClick={() => (n ? void ctx.playTag(tag) : startAddFor(tag))}
              >
                <Icon size={22} />
                <b>{tag}</b>
                <small>
                  {live ? "EN COURS" : n ? `${n} morceau${n > 1 ? "x" : ""}` : "+ ajouter"}
                </small>
              </button>
            );
          })}
          <button
            type="button"
            className={`mx-tile all ${context === "*" && m.is_playing ? "live" : ""}`}
            style={{ "--h": "var(--text)" } as CSSProperties}
            disabled={!queue.length || ctx.busy}
            title="Toute la bibliothèque"
            onClick={() => void ctx.playTag("*")}
          >
            <Library size={22} />
            <b>Tout</b>
            <small>
              {queue.length} morceau{queue.length > 1 ? "x" : ""}
            </small>
          </button>
        </div>
      </section>

      {/* ================= BIBLIOTHÈQUE ================= */}
      <section className="panel cut mx-lib">
        <div className="ph">
          <h2>Bibliothèque</h2>
          <span className="tag">
            {queue.length} MORCEAU{queue.length > 1 ? "X" : ""}
          </span>
        </div>
        <div className="mx-filters">
          {[
            { v: "*", l: "Tout", n: queue.length },
            ...MUSIC_TAGS.map((t) => ({ v: t as string, l: t as string, n: count(t) })).filter(
              (x) => x.n,
            ),
            ...(queue.some((t) => !t.tag)
              ? [{ v: "", l: "Sans ambiance", n: queue.filter((t) => !t.tag).length }]
              : []),
          ].map((f) => (
            <button
              type="button"
              key={f.v || "none"}
              className={filter === f.v ? "on" : ""}
              onClick={() => setFilter(f.v)}
              style={{ "--h": TAG_HUE[f.v] ?? "var(--cyan)" } as CSSProperties}
            >
              {f.l}
              <em>{f.n}</em>
            </button>
          ))}
          <label className="mx-search">
            <Search size={14} />
            <input
              placeholder="Chercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="mx-tracks">
          {shown.map(({ t, i }) => {
            const playing = i === index && !!m.source_id;
            const queued = m.next_up === t.video_id;
            return (
              <div
                key={`${t.video_id}:${i}`}
                className={`mx-track ${playing ? "on" : ""} ${t.broken ? "broken" : ""}`}
              >
                <button
                  type="button"
                  className="mx-thumb"
                  title={t.broken ? "Vidéo indisponible" : "Jouer maintenant"}
                  disabled={t.broken || ctx.busy}
                  onClick={() => void ctx.transitionTo(i, { context: t.tag ?? "*" })}
                >
                  <img src={thumb(t.video_id)} alt="" loading="lazy" />
                  <span>
                    {playing && m.is_playing ? (
                      <div className="eq">
                        <b />
                        <b />
                        <b />
                        <b />
                      </div>
                    ) : (
                      <Play size={16} />
                    )}
                  </span>
                </button>
                <div className="mx-tt">
                  <b title={t.title}>{t.title || t.video_id}</b>
                  <small>
                    {t.broken ? (
                      <span className="bad">
                        <AlertTriangle size={11} /> Indisponible
                      </span>
                    ) : t.duration ? (
                      fmt(t.duration)
                    ) : (
                      "—"
                    )}
                    {queued && <span className="q"> · à la suite</span>}
                  </small>
                </div>
                <select
                  className="mx-tag"
                  aria-label={`Ambiance de ${t.title}`}
                  value={t.tag ?? ""}
                  style={{ "--h": TAG_HUE[t.tag ?? ""] ?? "var(--mute)" } as CSSProperties}
                  onChange={(e) => void write(tagTrack(m, i, e.target.value))}
                >
                  <option value="">Sans ambiance</option>
                  {MUSIC_TAGS.map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
                <div className="mx-acts">
                  <Button
                    variant="prototype"
                    className={`mx-a ${queued ? "on" : ""}`}
                    title={
                      queued ? "Annuler « à la suite »" : "Jouer juste après le morceau en cours"
                    }
                    aria-label={`À la suite : ${t.title}`}
                    disabled={t.broken || playing}
                    onClick={() => void write({ ...m, next_up: queued ? undefined : t.video_id })}
                  >
                    <CornerDownRight size={15} />
                  </Button>
                  <Button
                    variant="prototype"
                    className="mx-a del"
                    title={playing ? "Morceau en cours" : "Retirer de la bibliothèque"}
                    aria-label={`Retirer ${t.title}`}
                    disabled={playing}
                    onClick={async () => {
                      if (
                        !(await confirmAction({
                          title: `Retirer « ${t.title} » de la bibliothèque ?`,
                        }))
                      )
                        return;
                      const cur = musicRef.current;
                      const k = (cur.queue ?? []).findIndex((x) => x.video_id === t.video_id);
                      if (k >= 0) void write(removeTrack(cur, k));
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
          {!shown.length && (
            <p className="note">
              {queue.length
                ? "Aucun morceau ici."
                : "Bibliothèque vide : ajoute un lien YouTube juste en dessous."}
            </p>
          )}
        </div>

        <div className="mx-add">
          <h5>
            <Link2 size={14} /> Ajouter de la musique
          </h5>
          <textarea
            ref={addBox}
            className="field"
            rows={2}
            placeholder="Colle un ou plusieurs liens YouTube (vidéos ou playlist)"
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void add();
              }
            }}
          />
          <div className="mx-addtags">
            <span>Ambiance :</span>
            {["", ...MUSIC_TAGS].map((tag) => (
              <button
                type="button"
                key={tag || "none"}
                className={addTag === tag ? "on" : ""}
                style={{ "--h": TAG_HUE[tag] ?? "var(--mute)" } as CSSProperties}
                onClick={() => setAddTag(tag)}
              >
                {tag || "Aucune"}
              </button>
            ))}
          </div>
          <Button
            variant="prototype"
            className="btn y mx-addbtn"
            disabled={!links.trim() || adding}
            onClick={() => void add()}
          >
            {adding ? (
              "Ajout en cours…"
            ) : (
              <>
                <ListPlus size={16} /> Ajouter à la bibliothèque
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
