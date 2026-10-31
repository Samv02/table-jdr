import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  centeredView,
  clampView,
  coverSize,
  panBy,
  zoomAt,
  type Size,
  type View,
} from "@/lib/scene-pan";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/lib/active-character";
import type { Music } from "@/lib/table";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { TableContext, type Scene, type PartyMember } from "@/lib/table-context";
export function TableEnvironment({ children }: { children: ReactNode }) {
  const identity = useIdentity();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [music, setMusic] = useState<Music>({});
  const [party, setParty] = useState<PartyMember[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [clean, setClean] = useState(false);
  const [offset, setOffset] = useState(0);
  const [layers, setLayers] = useState<{ url: string; id: string }[]>([]);
  const [titleVisible, setTitleVisible] = useState(false);
  async function refresh() {
    const [s, state, members, team] = await Promise.all([
      supabase.from("scenes").select("*").order("sort_order"),
      // Une seule ligne visible : celle de l'équipe active
      supabase.from("session_state").select("*").maybeSingle(),
      supabase.rpc("get_party"),
      supabase.rpc("get_team_members"),
    ]);
    // Échec normal avant connexion (get_party est réservé aux comptes) : on n'affiche rien.
    if (s.error || state.error || members.error) return;
    const signed = await supabase.storage.from("scenes").createSignedUrls(
      (s.data ?? []).map((x) => x.image_path),
      3600,
    );
    const urls = new Map(signed.data?.map((x) => [x.path, x.signedUrl]));
    setScenes((s.data ?? []).map((x) => ({ ...x, url: urls.get(x.image_path) })));
    setActiveId(state.data?.active_scene_id ?? null);
    setMusic((state.data?.music ?? {}) as Music);
    // Le MJ apparaît avec sa propre photo et sa couleur (profil du compte MJ)
    const gm = team.data?.find((m) => m.role === "gm");
    const gmRow: PartyMember = {
      character_id: "mj",
      handle: "MJ",
      avatar_url: gm?.avatar_url ?? null,
      color: gm?.color ?? "cyan",
    };
    const rows = [...((members.data ?? []) as PartyMember[]), gmRow];
    const avatars = await supabase.storage.from("avatars").createSignedUrls(
      rows.flatMap((x) => (x.avatar_url ? [x.avatar_url] : [])),
      3600,
    );
    const av = new Map(avatars.data?.map((x) => [x.path, x.signedUrl]));
    setParty(rows.map((x) => ({ ...x, avatar: x.avatar_url ? av.get(x.avatar_url) : undefined })));
  }
  useEffect(() => {
    setClean(localStorage.getItem("table:clean") === "true");
  }, []);
  useEffect(() => {
    document.body.classList.toggle("clean", clean);
    return () => document.body.classList.remove("clean");
  }, [clean]);
  const toggleClean = () =>
    setClean((old) => {
      localStorage.setItem("table:clean", String(!old));
      return !old;
    });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.matches("input,textarea,select") || e.target.isContentEditable)
      )
        return;
      if (e.key.toLowerCase() === "h" || (e.key === "Escape" && clean)) {
        e.preventDefault();
        toggleClean();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [clean]);
  useEffect(() => {
    if (!identity.userId || !identity.teamId) return;
    void refresh();
    const clock = async () => {
      const before = Date.now();
      const { data } = await supabase.rpc("table_server_time");
      if (data) setOffset(Date.parse(data) - (before + Date.now()) / 2);
    };
    void clock();
    const timer = setInterval(() => void clock(), 30000);
    const renew = setInterval(() => void refresh(), 3000000);
    const channel = supabase
      .channel(`session-${identity.userId}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_state" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scenes" },
        () => void refresh(),
      )
      .subscribe();
    window.addEventListener("table:refresh", refresh);
    window.addEventListener("profile:changed", refresh);
    return () => {
      clearInterval(timer);
      clearInterval(renew);
      void supabase.removeChannel(channel);
      window.removeEventListener("table:refresh", refresh);
      window.removeEventListener("profile:changed", refresh);
    };
  }, [identity.userId, identity.teamId]);
  useEffect(() => {
    if (!identity.userId || !identity.teamId) return;
    const channel = supabase.channel(`table-${identity.teamId}`, {
      config: { presence: { key: identity.userId } },
    });
    channel.on("presence", { event: "sync" }, () => {
      const ids = new Set<string>();
      Object.values(channel.presenceState()).forEach((entries) =>
        entries.forEach((entry) => {
          const key = (entry as unknown as { character_id?: string }).character_id;
          if (key) ids.add(key);
        }),
      );
      setOnline(ids);
    });
    channel.subscribe((status) => {
      // L'admin en visite n'allume pas le point vert du MJ de l'équipe
      if (status === "SUBSCRIBED" && !identity.isVisitor)
        void channel.track({ character_id: identity.isGm ? "mj" : (identity.active?.id ?? null) });
    });
    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [identity.userId, identity.teamId, identity.isGm, identity.isVisitor, identity.active?.id]);
  const activeScene = scenes.find((x) => x.id === activeId) ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!activeScene?.url) {
      setLayers([]);
      return;
    }
    let titleTimer: ReturnType<typeof setTimeout> | undefined;
    let cleanTimer: ReturnType<typeof setTimeout> | undefined;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setLayers((old) => [...old.slice(-1), { url: img.src, id: activeScene.id }]);
      setTitleVisible(true);
      titleTimer = setTimeout(() => setTitleVisible(false), 2800);
      cleanTimer = setTimeout(() => setLayers((old) => old.slice(-1)), 1500);
    };
    img.src = activeScene.url;
    return () => {
      cancelled = true;
      clearTimeout(titleTimer);
      clearTimeout(cleanTimer);
    };
  }, [activeScene?.id, activeScene?.image_path]);
  return (
    <TableContext.Provider
      value={{
        teamId: identity.teamId,
        scenes,
        activeScene,
        music,
        party,
        online,
        clean,
        toggleClean,
        refresh,
        serverNow: () => Date.now() + offset,
      }}
    >
      <SceneBackdrop layers={layers} clean={clean} />
      {/* Ambiance animée de l'univers (pluie, braises, cendres…), choisie dans MJ → Univers */}
      <div className="atmo" aria-hidden="true" />
      {activeScene && (
        <div className={`scene-title ${titleVisible ? "show" : ""}`}>
          <small>{activeScene.subtitle}</small>
          <b>{activeScene.name}</b>
        </div>
      )}
      <div id="ui" inert={clean}>
        {children}
      </div>
      {clean && (
        <>
          <p className="explore-hint">
            Glisse pour explorer · molette ou pincement pour zoomer · double-clic pour recentrer
          </p>
          <Button className="eye-restore" onClick={toggleClean}>
            <Eye /> Afficher l’interface
          </Button>
        </>
      )}
    </TableContext.Provider>
  );
}

/**
 * Fond de scène. En mode « interface masquée », l'image du dessus devient explorable :
 * glisser (souris / doigt), molette ou pincement pour zoomer, double-clic pour recentrer.
 * Réglage purement local : les autres joueurs ne voient pas ce que tu explores.
 */
function SceneBackdrop({
  layers,
  clean,
}: {
  layers: { url: string; id: string }[];
  clean: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<Record<string, Size>>({});
  const [screen, setScreen] = useState<Size>({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [returning, setReturning] = useState(false);
  const top = layers[layers.length - 1];
  const nat = top ? natural[top.url] : undefined;
  const base = nat && screen.w ? coverSize(nat, screen) : null;
  const viewRef = useRef(view);
  viewRef.current = view;
  const geo = useRef({ base, screen });
  geo.current = { base, screen };

  useEffect(() => {
    const measure = () => {
      const r = box.current?.getBoundingClientRect();
      if (r) setScreen({ w: r.width, h: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // Entrée en mode masqué / nouvelle image : départ centré (identique à l'affichage normal, donc sans saut)
  useEffect(() => {
    if (clean && base)
      setView((v) => (v ? clampView(v, base, screen) : centeredView(base, screen)));
  }, [clean, base?.w, base?.h, screen.w, screen.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setView(null);
  }, [top?.url]);
  // Sortie du mode masqué : retour en douceur au cadrage normal, puis affichage normal
  useEffect(() => {
    if (clean || !viewRef.current || !geo.current.base) return;
    setReturning(true);
    setView(centeredView(geo.current.base, geo.current.screen));
    const t = setTimeout(() => {
      setReturning(false);
      setView(null);
    }, 450);
    return () => clearTimeout(t);
  }, [clean]);

  const update = useCallback((fn: (v: View, b: Size, s: Size) => View) => {
    const { base: b, screen: s } = geo.current;
    if (!b) return;
    setView((v) => fn(v ?? centeredView(b, s), b, s));
  }, []);

  // Molette : écouteur natif non passif (pour empêcher le défilement de la page)
  useEffect(() => {
    const el = box.current;
    if (!el || !clean) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      update((v, b, s) =>
        zoomAt(v, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top, b, s),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clean, update]);

  // Glisser à la souris / au doigt, pincement à deux doigts, double-tap
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef(0);
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!clean) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.classList.add("grabbing");
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!clean || !prev) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (map.size === 1) update((v, b, s) => panBy(v, e.clientX - prev.x, e.clientY - prev.y, b, s));
    else if (map.size === 2) {
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (!other) return;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y),
        after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const mid = { x: (e.clientX + other.x) / 2 - r.left, y: (e.clientY + other.y) / 2 - r.top };
      if (before > 0)
        update((v, b, s) =>
          panBy(
            zoomAt(v, after / before, mid.x, mid.y, b, s),
            (e.clientX - prev.x) / 2,
            (e.clientY - prev.y) / 2,
            b,
            s,
          ),
        );
    }
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) e.currentTarget.classList.remove("grabbing");
    if (e.pointerType !== "mouse") {
      const now = Date.now();
      if (now - lastTap.current < 300) recenter();
      lastTap.current = now;
    }
  }
  function recenter() {
    const { base: b, screen: s } = geo.current;
    if (b) setView(centeredView(b, s));
  }

  return (
    <div
      id="scene"
      ref={box}
      aria-hidden
      className={`${clean ? "explorable" : ""} ${returning ? "returning" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={recenter}
    >
      {layers.map((layer, i) => {
        const isTop = i === layers.length - 1;
        const style =
          isTop && view && base
            ? {
                left: 0,
                top: 0,
                right: "auto",
                bottom: "auto",
                width: base.w,
                height: base.h,
                maxWidth: "none",
                objectFit: "fill" as const,
                transformOrigin: "0 0",
                transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.z})`,
              }
            : undefined;
        return (
          <img
            key={layer.url}
            src={layer.url}
            draggable={false}
            style={style}
            onLoad={(e) => {
              const t = e.currentTarget;
              setNatural((n) =>
                n[layer.url] ? n : { ...n, [layer.url]: { w: t.naturalWidth, h: t.naturalHeight } },
              );
            }}
            className={isTop ? "layer scene-image incoming" : "layer scene-image"}
            alt=""
          />
        );
      })}
    </div>
  );
}
