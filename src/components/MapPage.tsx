import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BoxSelect,
  Check,
  Copy,
  CopyPlus,
  Crosshair,
  DoorOpen,
  Eraser,
  Expand,
  EyeOff,
  Eye,
  Hand,
  ImagePlus,
  Loader2,
  type LucideIcon,
  MapPin,
  Minimize,
  Pencil,
  Plus,
  Radio,
  Redo2,
  Ruler,
  Settings2,
  Shield,
  Skull,
  Trash2,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { confirmAction } from "@/components/ConfirmDialog";
import { InlineError } from "@/components/InlineError";
import { MapBoard, type MapTool, type MapToken, type Ping } from "@/components/MapBoard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useIdentity } from "@/lib/active-character";
import {
  clampSize,
  MAP_MAX,
  MAP_MIN,
  nextLabel,
  readEdges,
  toggleDoor,
  type MapEdge,
  type Point,
} from "@/lib/map";
import { neonVar, validateAvatar } from "@/lib/profile";
import { createSaveQueue } from "@/lib/save-queue";
import { useTable } from "@/lib/table-context";

const MAP_COLUMNS =
  "id,name,width,height,walls,background_path,background_opacity,cell_value,cell_unit,show_grid,fog,players_move";
const TOKEN_COLUMNS = "id,map_id,kind,character_id,label,x,y,hidden,size,color";

type TokenRow = MapToken & { map_id: string };
type MapRow = {
  id: string;
  name: string;
  width: number;
  height: number;
  walls: unknown;
  background_path: string | null;
  background_opacity: number;
  cell_value: number;
  cell_unit: string;
  show_grid: boolean;
  fog: boolean;
  players_move: boolean;
};
type MapPatch = Partial<Omit<MapRow, "id" | "walls">>;
type Op =
  | { kind: "walls"; map: string; before: MapEdge[]; after: MapEdge[] }
  | { kind: "token"; id: string; before: Point; after: Point };

const TOOLS: { id: MapTool; label: string; key: string; icon: LucideIcon; gm?: boolean }[] = [
  { id: "move", label: "Déplacer", key: "v", icon: Hand },
  { id: "wall", label: "Mur", key: "m", icon: Pencil, gm: true },
  { id: "room", label: "Pièce", key: "b", icon: BoxSelect, gm: true },
  { id: "door", label: "Porte", key: "p", icon: DoorOpen, gm: true },
  { id: "erase", label: "Gomme", key: "e", icon: Eraser, gm: true },
  { id: "enemy", label: "Ennemi", key: "n", icon: Skull, gm: true },
  { id: "ally", label: "Allié", key: "a", icon: Shield, gm: true },
  { id: "measure", label: "Mesurer", key: "r", icon: Ruler },
  { id: "ping", label: "Signaler", key: "g", icon: MapPin },
];
const SIZES = [
  { value: 0.75, label: "P" },
  { value: 1, label: "M" },
  { value: 1.5, label: "G" },
  { value: 2.5, label: "TG" },
];
const COLORS = ["red", "green", "cyan", "yellow", "pink", "violet"];

function Switch({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Button
      role="switch"
      aria-checked={value}
      className={`uni-toggle map-switch ${value ? "on" : ""}`}
      onClick={() => onChange(!value)}
    >
      <i aria-hidden />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </Button>
  );
}

function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="map-panel" aria-label={title}>
      <header>
        <b>{title}</b>
        <Button aria-label="Fermer le panneau" onClick={onClose}>
          <X size={16} />
        </Button>
      </header>
      <div className="map-panel-body">{children}</div>
    </aside>
  );
}

const ALPHA_KEY = "table:map-alpha";
function readAlpha() {
  try {
    const saved = Number(localStorage.getItem(ALPHA_KEY));
    return saved >= 30 && saved <= 100 ? saved : 75;
  } catch {
    return 75;
  }
}

/**
 * Carte. Le MJ prépare et affiche sur sa page ; le joueur la voit en direct, dans une fenêtre
 * flottante posée sur sa fiche (`popup`), selon ce que la base lui autorise.
 */
export function MapPage({ popup = false, onClose }: { popup?: boolean; onClose?: () => void }) {
  const id = useIdentity();
  const table = useTable();
  const canEdit = id.isGm;
  const [maps, setMaps] = useState<MapRow[] | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [tool, setTool] = useState<MapTool>("move");
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<"map" | "tokens" | null>(null);
  const [full, setFull] = useState(false);
  const [alpha, setAlpha] = useState(readAlpha);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [background, setBackground] = useState<string | null>(null);
  const [remote, setRemote] = useState<Record<string, Point>>({});
  const [pings, setPings] = useState<Ping[]>([]);
  const [focus, setFocus] = useState<{ p: Point; n: number } | null>(null);
  const [canStep, setCanStep] = useState({ undo: false, redo: false });
  const queue = useRef(createSaveQueue());
  const past = useRef<Op[]>([]);
  const future = useRef<Op[]>([]);
  const live = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSent = useRef(0);
  const pingId = useRef(0);

  const load = useCallback(async () => {
    await queue.current.flush();
    const [m, s, t] = await Promise.all([
      supabase.from("maps").select(MAP_COLUMNS).order("created_at"),
      supabase.from("session_state").select("active_map_id").maybeSingle(),
      supabase.from("map_tokens").select(TOKEN_COLUMNS),
    ]);
    if (m.error || s.error || t.error)
      return setErr((m.error ?? s.error ?? t.error)?.message ?? null);
    if (queue.current.pending) return;
    setMaps(m.data as MapRow[]);
    setLiveId(s.data?.active_map_id ?? null);
    setTokens(t.data as TokenRow[]);
    setRemote({});
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`carte-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "maps" }, () => void load())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_tokens" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "session_state" },
        () => void load(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void load();
      });
    return () => void supabase.removeChannel(channel);
  }, [load]);

  const map = useMemo(() => {
    if (!maps) return null;
    const wanted = canEdit ? currentId : liveId;
    return maps.find((m) => m.id === wanted) ?? (canEdit ? maps[0] : null) ?? null;
  }, [maps, currentId, liveId, canEdit]);
  const mapId = map?.id;

  const addPing = useCallback((p: Ping) => {
    setPings((list) => [...list, p]);
    setTimeout(() => setPings((list) => list.filter((x) => x.id !== p.id)), 2200);
  }, []);

  // Passager et sans base : glissés et signaux circulent entre écrans, sans rien enregistrer
  useEffect(() => {
    if (!id.teamId) return;
    const channel = supabase
      .channel(`carte-live-${id.teamId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "move" }, ({ payload }) => {
        const m = payload as { id: string; x: number; y: number };
        setRemote((r) => ({ ...r, [m.id]: { x: m.x, y: m.y } }));
      })
      .on("broadcast", { event: "ping" }, ({ payload }) => {
        const m = payload as { map: string; x: number; y: number; color: string };
        if (m.map === mapRef.current) {
          pingId.current += 1;
          addPing({ id: pingId.current, x: m.x, y: m.y, color: m.color });
        }
      })
      .subscribe();
    live.current = channel;
    return () => {
      live.current = null;
      void supabase.removeChannel(channel);
    };
  }, [id.teamId, addPing]);
  const mapRef = useRef(mapId);
  useEffect(() => {
    mapRef.current = mapId;
    past.current = [];
    future.current = [];
    setCanStep({ undo: false, redo: false });
  }, [mapId]);

  const backgroundPath = map?.background_path ?? null;
  useEffect(() => {
    let alive = true;
    setBackground(null);
    if (backgroundPath)
      void supabase.storage
        .from("maps")
        .createSignedUrl(backgroundPath, 3600)
        .then(({ data }) => {
          if (alive) setBackground(data?.signedUrl ?? null);
        });
    return () => {
      alive = false;
    };
  }, [backgroundPath]);

  const edges = useMemo(() => readEdges(map?.walls), [map?.walls]);
  const onMap = useMemo(
    () => tokens.filter((t) => t.map_id === mapId).map((t) => ({ ...t, ...(remote[t.id] ?? {}) })),
    [tokens, mapId, remote],
  );
  const chosen = onMap.find((t) => t.id === selected) ?? null;
  const party = table.party.filter((p) => p.character_id !== "mj");
  const absent = party.filter((p) => !onMap.some((t) => t.character_id === p.character_id));
  const mine = useMemo(
    () => new Set(canEdit ? [] : id.characters.map((c) => c.id)),
    [canEdit, id.characters],
  );
  const myToken = onMap.find((t) => t.character_id && mine.has(t.character_id));
  const myColor = canEdit
    ? "var(--yellow)"
    : neonVar(party.find((p) => mine.has(p.character_id))?.color);

  /** L'écran change tout de suite, puis l'écriture part dans la file. */
  function write(save: () => PromiseLike<{ error: { message: string } | null }>) {
    setSaving((n) => n + 1);
    void queue.current
      .enqueue(async () => {
        const { error } = await save();
        if (error) throw new Error(error.message);
      })
      .catch((e: Error) => {
        setErr(`Enregistrement impossible : ${e.message}`);
        void load();
      })
      .finally(() => setSaving((n) => n - 1));
  }

  function storeEdges(target: string, next: MapEdge[]) {
    setMaps((list) => list?.map((m) => (m.id === target ? { ...m, walls: next } : m)) ?? list);
    write(() =>
      supabase
        .from("maps")
        .update({ walls: next as unknown as Json })
        .eq("id", target),
    );
  }
  function storeToken(tokenId: string, p: Point) {
    setTokens((list) => list.map((t) => (t.id === tokenId ? { ...t, ...p } : t)));
    write(() =>
      canEdit
        ? supabase.from("map_tokens").update(p).eq("id", tokenId)
        : supabase.rpc("move_my_token", { _id: tokenId, _x: p.x, _y: p.y }),
    );
  }
  function record(op: Op) {
    past.current.push(op);
    future.current = [];
    setCanStep({ undo: true, redo: false });
  }
  function step(from: typeof past, to: typeof past, side: "before" | "after") {
    const op = from.current.pop();
    if (!op) return;
    to.current.push(op);
    if (op.kind === "walls") storeEdges(op.map, op[side]);
    else storeToken(op.id, op[side]);
    setCanStep({ undo: past.current.length > 0, redo: future.current.length > 0 });
  }
  const undo = () => step(past, future, "before");
  const redo = () => step(future, past, "after");

  function saveEdges(next: MapEdge[]) {
    if (!map) return;
    record({ kind: "walls", map: map.id, before: edges, after: next });
    storeEdges(map.id, next);
  }
  function moveToken(tokenId: string, p: Point) {
    const t = tokens.find((x) => x.id === tokenId);
    if (t && canEdit) record({ kind: "token", id: tokenId, before: { x: t.x, y: t.y }, after: p });
    storeToken(tokenId, p);
  }
  function dragLive(tokenId: string, p: Point) {
    const t = tokens.find((x) => x.id === tokenId);
    const now = Date.now();
    // Un pion caché ne circule jamais vers les écrans des joueurs
    if (!t || t.hidden || now - lastSent.current < 70) return;
    lastSent.current = now;
    void live.current?.send({ type: "broadcast", event: "move", payload: { id: tokenId, ...p } });
  }
  function ping(p: Point) {
    if (!mapId) return;
    pingId.current += 1;
    addPing({ id: pingId.current, ...p, color: myColor });
    void live.current?.send({
      type: "broadcast",
      event: "ping",
      payload: { map: mapId, ...p, color: myColor },
    });
  }
  function patchMap(patch: MapPatch) {
    if (!mapId) return;
    setMaps((list) => list?.map((m) => (m.id === mapId ? { ...m, ...patch } : m)) ?? list);
    write(() => supabase.from("maps").update(patch).eq("id", mapId));
  }
  function patchToken(
    tokenId: string,
    patch: { label?: string; hidden?: boolean; size?: number; color?: string | null },
  ) {
    setTokens((list) => list.map((t) => (t.id === tokenId ? { ...t, ...patch } : t)));
    write(() => supabase.from("map_tokens").update(patch).eq("id", tokenId));
    // Un pion masqué n'envoie plus rien au joueur : la carte, elle, le prévient de recharger
    if (patch.hidden !== undefined && mapId)
      write(() =>
        supabase.from("maps").update({ updated_at: new Date().toISOString() }).eq("id", mapId),
      );
  }

  async function addToken(row: {
    kind: string;
    label: string;
    x: number;
    y: number;
    character_id?: string;
    size?: number;
    color?: string | null;
    hidden?: boolean;
  }) {
    if (!mapId) return;
    const { data, error } = await supabase
      .from("map_tokens")
      .insert({ ...row, map_id: mapId })
      .select(TOKEN_COLUMNS)
      .single();
    if (error) return setErr(error.message);
    const added = data as TokenRow;
    setTokens((list) => (list.some((t) => t.id === added.id) ? list : [...list, added]));
    setSelected(added.id);
  }
  const labels = onMap.map((t) => t.label);
  const place = (p: Point) => {
    const enemy = tool === "enemy";
    void addToken({
      kind: enemy ? "enemy" : "ally",
      label: nextLabel(enemy ? "Ennemi" : "Allié", labels),
      ...p,
    });
  };
  async function placeParty() {
    if (!map) return;
    for (const [i, p] of absent.entries())
      await addToken({
        kind: "party",
        character_id: p.character_id,
        label: p.handle,
        x: Math.min(map.width, 1 + i),
        y: 1,
      });
    setSelected(null);
  }
  function duplicateToken(t: MapToken) {
    if (t.kind === "party") return;
    void addToken({
      kind: t.kind,
      label: nextLabel(t.label.replace(/\s\d+$/, ""), labels),
      x: Math.min(t.x + 1, map?.width ?? t.x),
      y: t.y,
      size: t.size,
      color: t.color,
      hidden: t.hidden,
    });
  }
  async function removeToken(t: MapToken) {
    if (!(await confirmAction({ title: `Retirer « ${t.label} » de la carte ?` }))) return;
    setSelected(null);
    setTokens((list) => list.filter((x) => x.id !== t.id));
    write(() => supabase.from("map_tokens").delete().eq("id", t.id));
  }

  async function createMap(from?: MapRow) {
    const { data, error } = await supabase
      .from("maps")
      .insert({
        name: from ? `${from.name} (copie)`.slice(0, 60) : `Carte ${(maps?.length ?? 0) + 1}`,
        width: from?.width ?? 24,
        height: from?.height ?? 16,
        walls: (from?.walls ?? []) as Json,
        cell_value: from?.cell_value ?? 1,
        cell_unit: from?.cell_unit ?? "case",
        show_grid: from?.show_grid ?? true,
      })
      .select("id")
      .single();
    if (error) return setErr(error.message);
    if (from) {
      const copies = tokens
        .filter((t) => t.map_id === from.id)
        .map(({ id: _id, map_id: _map, ...t }) => ({ ...t, map_id: data.id }));
      if (copies.length) {
        const { error: e2 } = await supabase.from("map_tokens").insert(copies);
        if (e2) setErr(e2.message);
      }
    }
    setCurrentId(data.id);
    setSelected(null);
    await load();
  }
  async function deleteMap(m: MapRow) {
    const ok = await confirmAction({
      title: `Supprimer la carte « ${m.name} » ?`,
      message: "Ses murs, ses portes, son image et ses pions seront perdus.",
    });
    if (!ok) return;
    const { error } = await supabase.from("maps").delete().eq("id", m.id);
    if (error) return setErr(error.message);
    if (m.background_path) void supabase.storage.from("maps").remove([m.background_path]);
    setCurrentId(null);
    await load();
  }
  async function setLive(target: string | null) {
    if (!id.teamId) return;
    const { error } = await supabase
      .from("session_state")
      .update({ active_map_id: target })
      .eq("team_id", id.teamId);
    if (error) return setErr(error.message);
    setLiveId(target);
  }
  async function uploadBackground(f: File) {
    if (!map || !id.teamId) return;
    const problem = validateAvatar(f);
    if (problem) return setErr(problem);
    const path = `${id.teamId}/${map.id}-${Date.now()}.${f.name.split(".").pop() || "png"}`;
    const { error } = await supabase.storage.from("maps").upload(path, f, { contentType: f.type });
    if (error) return setErr(error.message);
    const old = map.background_path;
    patchMap({ background_path: path });
    if (old) void supabase.storage.from("maps").remove([old]);
  }
  function removeBackground() {
    const old = map?.background_path;
    patchMap({ background_path: null });
    if (old) void supabase.storage.from("maps").remove([old]);
  }

  const tools = TOOLS.filter((t) => canEdit || !t.gm);
  // Raccourcis : refait à chaque rendu pour lire l'état du moment
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e) => {
    const target = e.target as HTMLElement;
    if (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || document.querySelector(".confirm-veil"))
      return;
    const key = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (!canEdit) return;
      if (key === "z" && !e.shiftKey) undo();
      else if (key === "y" || (key === "z" && e.shiftKey)) redo();
      else if (key === "d" && chosen) duplicateToken(chosen);
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      if (popup) onClose?.();
      if (full) setFull(false);
      setSelected(null);
      setTool("move");
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && canEdit && chosen) {
      void removeToken(chosen);
      return;
    }
    const hit = tools.find((t) => t.key === key);
    if (hit) setTool(hit.id);
  };
  // Fenêtre du joueur : un clic en dehors la ferme ; le bouton Carte garde son propre rôle
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!popup) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!target.closest(".map-popup, [aria-label='Carte'], .confirm-veil")) close.current?.();
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [popup]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  if (maps === null && popup) return null;
  if (maps === null)
    return (
      <main className="empty-state">
        {err ? (
          <span className="note plain error" role="alert">
            {err}
          </span>
        ) : (
          "Chargement…"
        )}
      </main>
    );

  const isLive = !!map && map.id === liveId;
  const selectToken = (tokenId: string | null) => {
    setSelected(tokenId);
    if (tokenId && canEdit) setPanel("tokens");
  };

  const Shell = popup ? "div" : "main";
  return (
    <Shell
      className={popup ? "map-popup" : "map-screen"}
      style={popup ? { ["--map-alpha" as string]: `${alpha}%` } : undefined}
      {...(popup ? { role: "dialog", "aria-label": "Carte" } : {})}
    >
      <div className={`map-stage ${full ? "full" : ""}`}>
        {map ? (
          <MapBoard
            key={map.id}
            width={map.width}
            height={map.height}
            edges={edges}
            tokens={onMap}
            party={party}
            tool={tool}
            editable={canEdit}
            mine={mine}
            canDrag={(t) =>
              canEdit || (map.players_move && !!t.character_id && mine.has(t.character_id))
            }
            selected={selected}
            background={background}
            backgroundOpacity={map.background_opacity}
            showGrid={map.show_grid}
            vision={map.fog ? (canEdit ? "preview" : "player") : null}
            cellValue={map.cell_value}
            cellUnit={map.cell_unit}
            pings={pings}
            focus={focus}
            onEdges={saveEdges}
            onDoor={(key) => saveEdges(toggleDoor(edges, key))}
            onMove={moveToken}
            onDragLive={dragLive}
            onSelect={selectToken}
            onPlace={place}
            onPing={ping}
          />
        ) : (
          <div className="map-empty">
            {canEdit ? (
              <>
                <h1>Ta première carte</h1>
                <p>Trace des pièces, pose tes portes et place tes pions.</p>
                <Button className="btn y" onClick={() => void createMap()}>
                  <Plus size={16} /> Créer une carte
                </Button>
              </>
            ) : (
              <p>Le MJ n’affiche aucune carte pour l’instant.</p>
            )}
          </div>
        )}

        <div className="map-top">
          {canEdit && maps.length > 0 ? (
            <label className="map-pick">
              <span className="sr-only">Carte ouverte</span>
              <select
                className="field"
                value={map?.id ?? ""}
                onChange={(e) => {
                  setCurrentId(e.target.value);
                  setSelected(null);
                }}
              >
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === liveId ? " (affichée)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            map && <b className="map-title">{map.name}</b>
          )}
          {canEdit && map && (
            <>
              <Button
                className={`map-live ${isLive ? "on" : ""}`}
                aria-pressed={isLive}
                onClick={() => void setLive(isLive ? null : map.id)}
              >
                <Radio size={15} /> {isLive ? "Affichée" : "Afficher à la table"}
              </Button>
              <span className="map-saved" role="status">
                {saving > 0 ? (
                  <Loader2 size={14} className="spin" aria-label="Enregistrement" />
                ) : (
                  <Check size={14} aria-label="Tout est enregistré" />
                )}
              </span>
              <Button
                aria-label="Annuler"
                title="Annuler (Ctrl+Z)"
                disabled={!canStep.undo}
                onClick={undo}
              >
                <Undo2 size={16} />
              </Button>
              <Button
                aria-label="Rétablir"
                title="Rétablir (Ctrl+Y)"
                disabled={!canStep.redo}
                onClick={redo}
              >
                <Redo2 size={16} />
              </Button>
              <Button
                aria-label="Pions"
                title="Pions"
                aria-pressed={panel === "tokens"}
                onClick={() => setPanel((p) => (p === "tokens" ? null : "tokens"))}
              >
                <Users size={16} />
              </Button>
              <Button
                aria-label="Réglages de la carte"
                title="Réglages de la carte"
                aria-pressed={panel === "map"}
                onClick={() => setPanel((p) => (p === "map" ? null : "map"))}
              >
                <Settings2 size={16} />
              </Button>
            </>
          )}
          {!canEdit && myToken && (
            <Button
              aria-label="Me retrouver"
              title="Me retrouver"
              onClick={() => setFocus({ p: myToken, n: Date.now() })}
            >
              <Crosshair size={16} />
            </Button>
          )}
          {popup && (
            <label className="map-alpha" title="Transparence de la carte">
              <span className="sr-only">Transparence de la carte</span>
              <input
                type="range"
                min={30}
                max={100}
                step={5}
                value={alpha}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setAlpha(next);
                  try {
                    localStorage.setItem(ALPHA_KEY, String(next));
                  } catch {
                    /* rien : simple confort */
                  }
                }}
              />
            </label>
          )}
          {popup && (
            <Button aria-label="Fermer la carte" title="Fermer (Échap)" onClick={onClose}>
              <X size={17} />
            </Button>
          )}
          {map && !popup && (
            <Button
              aria-label={full ? "Quitter le plein écran" : "Plein écran"}
              title={full ? "Quitter le plein écran (Échap)" : "Plein écran"}
              onClick={() => setFull((f) => !f)}
            >
              {full ? <Minimize size={16} /> : <Expand size={16} />}
            </Button>
          )}
        </div>
        {err && (
          <div className="map-error">
            <InlineError message={err} onClear={() => setErr(null)} />
          </div>
        )}

        {map && (
          <div className="map-tools" role="radiogroup" aria-label="Outil">
            {tools.map(({ id: toolId, label, key, icon: Icon }) => (
              <Button
                key={toolId}
                role="radio"
                aria-checked={tool === toolId}
                aria-label={label}
                title={`${label} (${key.toUpperCase()})`}
                className={tool === toolId ? "on" : ""}
                onClick={() => setTool(toolId)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </Button>
            ))}
          </div>
        )}

        {canEdit && map && panel === "map" && (
          <Panel title="Réglages de la carte" onClose={() => setPanel(null)}>
            <label className="uni-field" key={`name-${map.id}`}>
              <span>Nom</span>
              <input
                className="field"
                defaultValue={map.name}
                maxLength={60}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== map.name) patchMap({ name });
                }}
              />
            </label>
            <div className="map-pair" key={`size-${map.id}-${map.width}-${map.height}`}>
              <label className="uni-field">
                <span>Largeur</span>
                <input
                  className="field"
                  type="number"
                  min={MAP_MIN}
                  max={MAP_MAX}
                  defaultValue={map.width}
                  onBlur={(e) => {
                    const width = clampSize(Number(e.target.value));
                    if (width !== map.width) patchMap({ width });
                    else e.target.value = String(width);
                  }}
                />
              </label>
              <label className="uni-field">
                <span>Hauteur</span>
                <input
                  className="field"
                  type="number"
                  min={MAP_MIN}
                  max={MAP_MAX}
                  defaultValue={map.height}
                  onBlur={(e) => {
                    const height = clampSize(Number(e.target.value));
                    if (height !== map.height) patchMap({ height });
                    else e.target.value = String(height);
                  }}
                />
              </label>
            </div>
            <div className="map-pair" key={`scale-${map.id}`}>
              <label className="uni-field">
                <span>Une case vaut</span>
                <input
                  className="field"
                  type="number"
                  min={0.1}
                  step={0.5}
                  defaultValue={map.cell_value}
                  onBlur={(e) => {
                    const cell_value = Number(e.target.value);
                    if (cell_value > 0 && cell_value <= 1000) patchMap({ cell_value });
                  }}
                />
              </label>
              <label className="uni-field">
                <span>Unité</span>
                <input
                  className="field"
                  defaultValue={map.cell_unit}
                  maxLength={12}
                  onBlur={(e) => {
                    const cell_unit = e.target.value.trim();
                    if (cell_unit) patchMap({ cell_unit });
                  }}
                />
              </label>
            </div>
            <Switch
              label="Grille"
              value={map.show_grid}
              onChange={(show_grid) => patchMap({ show_grid })}
            />
            <Switch
              label="Vision limitée"
              hint="Les joueurs ne voient que ce que le groupe voit : murs et portes fermées bloquent la vue."
              value={map.fog}
              onChange={(fog) => patchMap({ fog })}
            />
            <Switch
              label="Les joueurs bougent leur pion"
              value={map.players_move}
              onChange={(players_move) => patchMap({ players_move })}
            />
            <h3>Image de fond</h3>
            <div className="map-row">
              <input
                id="map-background"
                type="file"
                accept="image/*"
                className="profile-file"
                aria-label="Choisir une image de fond"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadBackground(f);
                  e.target.value = "";
                }}
              />
              <label className="btn" htmlFor="map-background">
                <ImagePlus size={15} aria-hidden="true" />
                {map.background_path ? "Changer" : "Choisir une image"}
              </label>
              {map.background_path && (
                <Button className="btn red" aria-label="Retirer l’image" onClick={removeBackground}>
                  <Trash2 size={15} />
                </Button>
              )}
            </div>
            {map.background_path && (
              <label className="uni-field">
                <span>Opacité de l’image</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={map.background_opacity}
                  onChange={(e) => patchMap({ background_opacity: Number(e.target.value) })}
                />
              </label>
            )}
            <h3>Cette carte</h3>
            <div className="map-row">
              <Button className="btn" onClick={() => void createMap()}>
                <Plus size={15} /> Nouvelle
              </Button>
              <Button className="btn" onClick={() => void createMap(map)}>
                <Copy size={15} /> Dupliquer
              </Button>
              <Button
                className="btn red"
                aria-label="Supprimer cette carte"
                onClick={() => void deleteMap(map)}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </Panel>
        )}

        {canEdit && map && panel === "tokens" && (
          <Panel title={`Pions (${onMap.length})`} onClose={() => setPanel(null)}>
            {absent.length > 0 && (
              <Button className="btn y" onClick={() => void placeParty()}>
                <UserPlus size={15} /> Placer le groupe ({absent.length})
              </Button>
            )}
            {chosen && (
              <div className="map-token-edit" key={chosen.id}>
                <label className="uni-field">
                  <span>Nom</span>
                  <input
                    className="field"
                    defaultValue={chosen.label}
                    maxLength={40}
                    disabled={chosen.kind === "party"}
                    onBlur={(e) => {
                      const label = e.target.value.trim();
                      if (label && label !== chosen.label) patchToken(chosen.id, { label });
                    }}
                  />
                </label>
                <div className="map-seg" role="group" aria-label="Taille du pion">
                  {SIZES.map((s) => (
                    <Button
                      key={s.value}
                      aria-pressed={chosen.size === s.value}
                      onClick={() => patchToken(chosen.id, { size: s.value })}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
                <div className="map-colors" role="group" aria-label="Couleur du pion">
                  {COLORS.map((c) => (
                    <Button
                      key={c}
                      aria-label={`Couleur ${c}`}
                      aria-pressed={chosen.color === c}
                      style={{ ["--t" as string]: `var(--${c})` }}
                      onClick={() =>
                        patchToken(chosen.id, { color: chosen.color === c ? null : c })
                      }
                    />
                  ))}
                </div>
                <div className="map-row">
                  <Button
                    className="btn"
                    aria-pressed={chosen.hidden}
                    onClick={() => patchToken(chosen.id, { hidden: !chosen.hidden })}
                  >
                    {chosen.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                    {chosen.hidden ? "Caché" : "Visible"}
                  </Button>
                  {chosen.kind !== "party" && (
                    <Button
                      className="btn"
                      aria-label={`Dupliquer ${chosen.label}`}
                      title="Dupliquer (Ctrl+D)"
                      onClick={() => duplicateToken(chosen)}
                    >
                      <CopyPlus size={15} />
                    </Button>
                  )}
                  <Button
                    className="btn red"
                    aria-label={`Retirer ${chosen.label}`}
                    title="Retirer (Suppr)"
                    onClick={() => void removeToken(chosen)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            )}
            <ul className="map-list">
              {onMap.map((t) => (
                <li key={t.id}>
                  <Button
                    className={t.id === selected ? "on" : ""}
                    onClick={() => {
                      setSelected(t.id);
                      setFocus({ p: t, n: Date.now() });
                    }}
                  >
                    <i className={`dot ${t.kind}`} aria-hidden="true" />
                    <span>{t.label}</span>
                    {t.hidden && <EyeOff size={13} aria-label="Caché" />}
                  </Button>
                </li>
              ))}
            </ul>
            {!onMap.length && (
              <p className="note plain">
                Choisis Ennemi ou Allié dans les outils, puis touche la carte.
              </p>
            )}
          </Panel>
        )}
      </div>
    </Shell>
  );
}
