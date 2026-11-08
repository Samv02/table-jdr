import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Armchair,
  BoxSelect,
  Check,
  CloudFog,
  Copy,
  Dices,
  Download,
  CopyPlus,
  Crosshair,
  DoorOpen,
  Eraser,
  Expand,
  FileUp,
  Monitor,
  Printer,
  EyeOff,
  Eye,
  Hand,
  Hexagon,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Layers,
  Loader2,
  Lock,
  LockOpen,
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
  Stamp,
  Trash2,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { confirmAction } from "@/components/ConfirmDialog";
import { InlineError } from "@/components/InlineError";
import {
  MapBoard,
  type FogBrush,
  type MapTool,
  type MapToken,
  type Ping,
} from "@/components/MapBoard";
import {
  ObjectEditor,
  ObjectLibrary,
  SourcePreview,
  type ObjectSource,
} from "@/components/MapObjects";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useIdentity } from "@/lib/active-character";
import {
  DEFAULT_SHAPE_SETTINGS,
  SHAPE_KINDS,
  WEAR_MAX,
  readShapes,
  shapesToJson,
  type MapShape,
  type ShapeSettings,
} from "@/lib/map-shapes";
import {
  clampSize,
  DOOR_TYPES,
  MAP_MAX,
  MAP_MIN,
  nextLabel,
  readEdges,
  toggleDoor,
  type DoorType,
  type MapEdge,
  type Point,
} from "@/lib/map";
import {
  MAP_LAYERS,
  MAP_STYLES,
  STYLE_COLORS,
  applyPreset,
  isTweaked,
  readMapStyle,
  styleToJson,
  type MapStyle,
} from "@/lib/map-style";
import {
  DEFAULT_STAMP,
  newObjectId,
  objectsToJson,
  readObjects,
  restack,
  snapObjectCenter,
  updateObject,
  type MapObject,
  type StampSettings,
} from "@/lib/map-objects";
import { clearZone, copyZone, pasteClip, type Clip, type Zone } from "@/lib/map-zone";
import { DEFAULT_DUNGEON, generateDungeon, type DungeonOptions } from "@/lib/map-dungeon";
import {
  FILE_FORMAT,
  FILE_VERSION,
  download,
  fileName,
  imageSize,
  mapImage,
  readMapFile,
  type MapFile,
} from "@/lib/map-export";
import { fillMask, maskToText, readLight, readMask, type LightSettings } from "@/lib/map-light";
import {
  LAYERS_MAX,
  MAIN_LAYER,
  hiddenShapes,
  levelLabel,
  neighborFloor,
  nextPosition,
  partySpots,
  swapLayer,
  visibleShapes,
  type LayerView,
} from "@/lib/map-layers";
import { neonVar, validateAvatar } from "@/lib/profile";
import { createSaveQueue } from "@/lib/save-queue";
import { useTable } from "@/lib/table-context";

const MAP_COLUMNS =
  "id,name,width,height,place,level,walls,shapes,style,objects,light,manual_fog,fog_mask,background_path,background_opacity,cell_value,cell_unit,show_grid,fog,players_move,vision_mode,vision_range,vision_corners";
const TOKEN_COLUMNS = "id,map_id,kind,character_id,label,x,y,hidden,size,color";
const LAYER_COLUMNS = "id,map_id,name,position,hidden,locked,shapes,objects";
type LayerRow = {
  id: string;
  map_id: string;
  name: string;
  position: number;
  hidden: boolean;
  locked: boolean;
  shapes: unknown;
  objects: unknown;
};

type TokenRow = MapToken & { map_id: string };
type MapRow = {
  id: string;
  name: string;
  width: number;
  height: number;
  place: string | null;
  level: number;
  walls: unknown;
  shapes: unknown;
  style: unknown;
  objects: unknown;
  light: unknown;
  manual_fog: boolean;
  fog_mask: string;
  background_path: string | null;
  background_opacity: number;
  cell_value: number;
  cell_unit: string;
  show_grid: boolean;
  fog: boolean;
  vision_mode: "room" | "sight";
  vision_range: number;
  vision_corners: boolean;
  players_move: boolean;
};
type MapPatch = Partial<
  Omit<MapRow, "id" | "walls" | "shapes" | "style" | "objects" | "light" | "fog_mask">
>;
/** Contenu dessiné d'une carte : seuls les champs présents sont touchés */
type Content = { walls?: MapEdge[]; shapes?: MapShape[]; objects?: MapObject[]; fog?: string };
type Op =
  | { kind: "content"; map: string; layer: string | null; before: Content; after: Content }
  | { kind: "token"; id: string; before: Point; after: Point };

const TOOLS: { id: MapTool; label: string; key: string; icon: LucideIcon; gm?: boolean }[] = [
  { id: "move", label: "Déplacer", key: "v", icon: Hand },
  { id: "wall", label: "Mur", key: "m", icon: Pencil, gm: true },
  { id: "shape", label: "Sol", key: "b", icon: Hexagon, gm: true },
  { id: "door", label: "Porte", key: "p", icon: DoorOpen, gm: true },
  { id: "object", label: "Objet", key: "o", icon: Armchair, gm: true },
  { id: "stamp", label: "Tampon", key: "t", icon: Stamp, gm: true },
  { id: "zone", label: "Zone", key: "c", icon: BoxSelect, gm: true },
  { id: "fog", label: "Brouillard", key: "f", icon: CloudFog, gm: true },
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
/** Cercle : 0 = rond, puis polygones réguliers */
const SIDES = [0, 3, 4, 5, 6, 8];
const ROUNDS = [
  { value: 0, label: "Vifs" },
  { value: 0.5, label: "½" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
];
const SNAPS = [
  { value: 1, label: "Case", hint: "Sur la grille" },
  { value: 0.5, label: "½", hint: "Sur la demi-case" },
  { value: 0, label: "Libre", hint: "Sans aimant" },
];

const STAMP_SIZES = [
  { value: "s", label: "P", min: 0.5, max: 0.9 },
  { value: "m", label: "M", min: 0.8, max: 1.4 },
  { value: "l", label: "G", min: 1.3, max: 2.2 },
];
type PlaceKind = "select" | "source" | "stairs" | "text" | "light";

/** Choix d'une valeur dans une petite rangée de boutons. */
function Pick<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="map-opt" role="radiogroup" aria-label={label}>
      <small aria-hidden="true">{label}</small>
      {options.map((o) => (
        <Button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/** Réglages de l'outil Sol : la forme, puis ses options. */
function ShapeBar({
  value: o,
  onChange,
}: {
  value: ShapeSettings;
  onChange: (patch: Partial<ShapeSettings>) => void;
}) {
  return (
    <>
      <div className="map-door-types" role="radiogroup" aria-label="Forme du sol">
        {SHAPE_KINDS.map((k) => (
          <Button
            key={k.id}
            role="radio"
            aria-checked={o.kind === k.id}
            title={k.hint}
            onClick={() => onChange({ kind: k.id })}
          >
            {k.label}
          </Button>
        ))}
        <span className="map-sep" aria-hidden="true" />
        <Button
          role="switch"
          aria-checked={o.erase}
          className={`map-erase ${o.erase ? "on" : ""}`}
          title="Creuser : la forme retire du sol (piliers, alcôves). Touche X"
          onClick={() => onChange({ erase: !o.erase })}
        >
          {o.erase ? "Creuser" : "Ajouter"}
        </Button>
      </div>
      <div className="map-door-types map-shape-opts" aria-label="Options du sol">
        <Pick
          label="Matière"
          value={o.layer}
          options={MAP_LAYERS.map((l) => ({ value: l.id, label: l.label, hint: l.hint }))}
          onChange={(layer) => onChange({ layer })}
        />
        {o.kind === "rect" && (
          <Pick
            label="Coins"
            value={o.round}
            options={ROUNDS}
            onChange={(round) => onChange({ round })}
          />
        )}
        {o.kind === "ellipse" && (
          <Pick
            label="Côtés"
            value={o.sides}
            options={SIDES.map((n) => ({ value: n, label: n ? String(n) : "Rond" }))}
            onChange={(sides) => onChange({ sides })}
          />
        )}
        {o.kind === "path" && (
          <>
            <Pick
              label="Largeur"
              value={o.width}
              options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
              onChange={(width) => onChange({ width })}
            />
            <Pick
              label="Tracé"
              value={o.curve}
              options={[
                { value: false, label: "Droit" },
                { value: true, label: "Courbe" },
              ]}
              onChange={(curve) => onChange({ curve })}
            />
          </>
        )}
        {o.kind === "poly" && (
          <Pick
            label="Contour"
            value={o.round > 0}
            options={[
              { value: false, label: "Droit" },
              { value: true, label: "Arrondi" },
            ]}
            onChange={(r) => onChange({ round: r ? 1 : 0 })}
          />
        )}
        <Pick
          label="Aimant"
          value={o.snap}
          options={SNAPS}
          onChange={(snap) => onChange({ snap })}
        />
        <Pick
          label="Usure"
          value={o.wear}
          options={Array.from({ length: WEAR_MAX + 1 }, (_, n) => ({
            value: n,
            label: n ? String(n) : "Net",
          }))}
          onChange={(wear) => onChange({ wear })}
        />
      </div>
    </>
  );
}

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

/** Apparence de la carte : un style de départ, puis les retouches. */
function StyleSection({
  value: st,
  onChange,
}: {
  value: MapStyle;
  onChange: (s: MapStyle) => void;
}) {
  const set = (patch: Partial<MapStyle>) => onChange({ ...st, ...patch });
  return (
    <>
      <div className="map-styles" role="radiogroup" aria-label="Style de la carte">
        {MAP_STYLES.map((p) => (
          <Button
            key={p.id}
            role="radio"
            aria-checked={st.preset === p.id}
            title={p.hint}
            className="map-style-pick"
            onClick={() => onChange(applyPreset(p.id))}
          >
            <span
              className="map-style-swatch"
              aria-hidden="true"
              style={
                {
                  "--sw-rock": p.value.rock ?? "var(--ink)",
                  "--sw-floor": p.value.floor ?? "var(--panel)",
                  "--sw-wall": p.value.wall ?? "var(--text)",
                } as CSSProperties
              }
            >
              <i />
            </span>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="map-style-colors">
        {STYLE_COLORS.map(({ key, label }) => {
          const v = st[key] as string | null;
          return (
            <label key={key} className="map-color" title={v ? v : "Couleur du thème"}>
              <input
                type="color"
                value={v ?? "#808080"}
                onChange={(e) => set({ [key]: e.target.value })}
              />
              <span>
                {label}
                {!v && <small>thème</small>}
              </span>
            </label>
          );
        })}
      </div>
      <label className="uni-field">
        <span>Épaisseur des murs : {st.wallWidth}</span>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={st.wallWidth}
          onChange={(e) => set({ wallWidth: Number(e.target.value) })}
        />
      </label>
      <Switch
        label="Hachures autour des murs"
        value={st.hatch}
        onChange={(hatch) => set({ hatch })}
      />
      {st.hatch && (
        <label className="uni-field">
          <span>Largeur des hachures</span>
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.25}
            value={st.hatchSize}
            onChange={(e) => set({ hatchSize: Number(e.target.value) })}
          />
        </label>
      )}
      <Switch
        label="Ombre sous les salles"
        value={st.shadow}
        onChange={(shadow) => set({ shadow })}
      />
      <Switch
        label="Grille hors des salles"
        hint="Sinon, la grille ne se voit que dans les salles."
        value={st.gridOutside}
        onChange={(gridOutside) => set({ gridOutside })}
      />
      {isTweaked(st) && (
        <Button className="btn" onClick={() => onChange(applyPreset(st.preset))}>
          Revenir au style d’origine
        </Button>
      )}
    </>
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

const HIDDEN_KEY = "table:map-place-hidden";
function readPlaceHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
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
  /**
   * Écran de table (/carte?ecran=1) : la carte affichée, telle que la voient les joueurs,
   * sans aucun outil. Ouvert par le MJ, dont le compte reçoit aussi ce qui est caché :
   * calques et pions cachés sont donc retirés ici.
   */
  const [screen] = useState(
    () =>
      !popup &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("ecran"),
  );
  const canEdit = id.isGm && !screen;
  const [maps, setMaps] = useState<MapRow[] | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [layers, setLayers] = useState<LayerRow[]>([]);
  /** Calque où l'on dessine ; null : le calque principal */
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [tool, setTool] = useState<MapTool>("move");
  const [doorType, setDoorType] = useState<DoorType>("simple");
  const [shapeSettings, setShapeSettings] = useState<ShapeSettings>(DEFAULT_SHAPE_SETTINGS);
  const shapeOpt = (patch: Partial<ShapeSettings>) => setShapeSettings((o) => ({ ...o, ...patch }));
  const [placeHidden, setPlaceHidden] = useState(readPlaceHidden);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<
    "map" | "tokens" | "library" | "layers" | "dungeon" | "export" | null
  >(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [placeKind, setPlaceKind] = useState<PlaceKind>("select");
  const [source, setSource] = useState<ObjectSource | null>(null);
  const [objectSnap, setObjectSnap] = useState(0.5);
  const [stamp, setStamp] = useState<StampSettings>(DEFAULT_STAMP);
  const [fogBrush, setFogBrush] = useState<FogBrush>({ mode: "brush", reveal: true, size: 2 });
  const [dungeon, setDungeon] = useState<DungeonOptions>(DEFAULT_DUNGEON);
  /** Dernier donjon tiré : on peut en retirer un autre sans redemander confirmation */
  const lastDungeon = useRef<unknown>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [library, setLibrary] = useState<string[]>([]);
  const [objectUrls, setObjectUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef(objectUrls);
  urlsRef.current = objectUrls;
  const pendingObjects = useRef<{ map: string; layer: string | null; list: MapObject[] } | null>(
    null,
  );
  const objectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPatch = useRef<{ id: string; t: number } | null>(null);
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
    const [m, s, t, l] = await Promise.all([
      supabase.from("maps").select(MAP_COLUMNS).order("created_at"),
      supabase.from("session_state").select("active_map_id").maybeSingle(),
      supabase.from("map_tokens").select(TOKEN_COLUMNS),
      // Un joueur ne reçoit que les calques visibles de la carte affichée (règle en base)
      supabase.from("map_layers").select(LAYER_COLUMNS),
    ]);
    if (m.error || s.error || t.error || l.error)
      return setErr((m.error ?? s.error ?? t.error ?? l.error)?.message ?? null);
    if (queue.current.pending) return;
    setMaps(m.data as MapRow[]);
    setLiveId(s.data?.active_map_id ?? null);
    setTokens(t.data as TokenRow[]);
    setLayers(l.data as LayerRow[]);
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
        { event: "*", schema: "public", table: "map_layers" },
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
    setActiveLayer(null);
    setSelectedObject(null);
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
  const mapStyle = useMemo(() => readMapStyle(map?.style), [map?.style]);
  const lightSettings = useMemo(() => readLight(map?.light), [map?.light]);
  const fogMask = useMemo(() => readMask(map?.fog_mask), [map?.fog_mask]);
  const mapLayers = useMemo(
    () =>
      layers
        .filter((l) => l.map_id === mapId && !(screen && l.hidden))
        .sort((a, b) => a.position - b.position),
    [layers, mapId, screen],
  );
  const baseShapes = useMemo(() => readShapes(map?.shapes), [map?.shapes]);
  const baseObjects = useMemo(() => readObjects(map?.objects), [map?.objects]);
  const views = useMemo<LayerView[]>(
    () => [
      {
        id: null,
        name: MAIN_LAYER,
        hidden: false,
        locked: false,
        shapes: baseShapes,
        objects: baseObjects,
      },
      ...mapLayers.map((l) => ({
        id: l.id,
        name: l.name,
        hidden: l.hidden,
        locked: l.locked,
        shapes: readShapes(l.shapes),
        objects: readObjects(l.objects),
      })),
    ],
    [baseShapes, baseObjects, mapLayers],
  );
  const activeView = views.find((v) => v.id === activeLayer) ?? views[0]!;
  const layerId = activeView.id;
  const shapes = activeView.shapes;
  const objects = activeView.objects;
  const allShapes = useMemo(() => visibleShapes(views), [views]);
  const ghostShapes = useMemo(() => (canEdit ? hiddenShapes(views) : []), [views, canEdit]);
  const layerObjects = useMemo(
    () => views.map((v) => ({ id: v.id, objects: v.objects, ghost: v.hidden })),
    [views],
  );
  const chosenObject = objects.find((o) => o.id === selectedObject) ?? null;

  // Liens signés des images (objets posés, bibliothèque) : demandés une fois, en un seul appel
  const imagePaths = [
    ...new Set([
      ...objects.flatMap((o) => (o.src ? [o.src] : [])),
      ...library,
      ...(source?.k === "image" ? [source.src] : []),
    ]),
  ]
    .sort()
    .join("|");
  useEffect(() => {
    const missing = imagePaths.split("|").filter((p) => p && !urlsRef.current[p]);
    if (!missing.length) return;
    let alive = true;
    void supabase.storage
      .from("maps")
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        if (!alive || !data) return;
        const found: Record<string, string> = {};
        for (const d of data) if (d.path && d.signedUrl) found[d.path] = d.signedUrl;
        setObjectUrls((u) => ({ ...u, ...found }));
      });
    return () => {
      alive = false;
    };
  }, [imagePaths]);

  const teamId = id.teamId;
  const loadLibrary = useCallback(async () => {
    if (!teamId) return;
    const { data } = await supabase.storage
      .from("maps")
      .list(`${teamId}/objets`, { limit: 300, sortBy: { column: "created_at", order: "desc" } });
    setLibrary(
      (data ?? [])
        .filter((f) => f.id && !f.name.startsWith("."))
        .map((f) => `${teamId}/objets/${f.name}`),
    );
  }, [teamId]);
  useEffect(() => {
    if (panel === "library") void loadLibrary();
  }, [panel, loadLibrary]);
  const styleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMap = useMemo(
    () =>
      tokens
        .filter((t) => t.map_id === mapId && !(screen && t.hidden))
        .map((t) => ({ ...t, ...(remote[t.id] ?? {}) })),
    [tokens, mapId, remote, screen],
  );
  const chosen = onMap.find((t) => t.id === selected) ?? null;
  const party = table.party.filter((p) => p.character_id !== "mj");
  const isLiveMap = !!mapId && mapId === liveId;
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

  /** Écrit tout de suite les retouches d'objet en attente, pour garder l'ordre des écritures. */
  function flushObjects() {
    if (objectTimer.current) clearTimeout(objectTimer.current);
    objectTimer.current = null;
    const pending = pendingObjects.current;
    pendingObjects.current = null;
    if (!pending) return;
    const objectsJson = objectsToJson(pending.list) as unknown as Json;
    write(() =>
      pending.layer
        ? supabase.from("map_layers").update({ objects: objectsJson }).eq("id", pending.layer)
        : supabase.from("maps").update({ objects: objectsJson }).eq("id", pending.map),
    );
  }
  /** Écran d'abord : les sols et objets vont dans leur calque, les murs restent sur la carte. */
  function showContent(target: string, layer: string | null, next: Content) {
    const { walls, fog, ...drawn } = next;
    const onMap = {
      ...(layer ? (walls ? { walls } : {}) : { ...drawn, ...(walls ? { walls } : {}) }),
      ...(fog !== undefined ? { fog_mask: fog } : {}),
    };
    if (Object.keys(onMap).length)
      setMaps((list) => list?.map((m) => (m.id === target ? { ...m, ...onMap } : m)) ?? list);
    if (layer && Object.keys(drawn).length)
      setLayers((list) => list.map((l) => (l.id === layer ? { ...l, ...drawn } : l)));
  }
  function storeContent(target: string, layer: string | null, next: Content) {
    flushObjects();
    lastPatch.current = null;
    const mapRow: { walls?: Json; shapes?: Json; objects?: Json; fog_mask?: string } = {};
    const layerRow: { shapes?: Json; objects?: Json } = {};
    const drawn = layer ? layerRow : mapRow;
    if (next.walls) mapRow.walls = next.walls as unknown as Json;
    if (next.fog !== undefined) mapRow.fog_mask = next.fog;
    if (next.shapes) drawn.shapes = shapesToJson(next.shapes) as unknown as Json;
    if (next.objects) drawn.objects = objectsToJson(next.objects) as unknown as Json;
    showContent(target, layer, next);
    if (Object.keys(mapRow).length)
      write(() => supabase.from("maps").update(mapRow).eq("id", target));
    if (layer && Object.keys(layerRow).length)
      write(() => supabase.from("map_layers").update(layerRow).eq("id", layer));
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
    if (op.kind === "content") storeContent(op.map, op.layer, op[side]);
    else storeToken(op.id, op[side]);
    setCanStep({ undo: past.current.length > 0, redo: future.current.length > 0 });
  }
  const undo = () => step(past, future, "before");
  const redo = () => step(future, past, "after");

  /** Une action du MJ sur le dessin : enregistrée, et annulable d'un seul coup. */
  function saveContent(next: Content) {
    if (!map) return;
    const before: Content = {};
    if (next.walls) before.walls = edges;
    if (next.fog !== undefined) before.fog = map.fog_mask;
    if (next.shapes) before.shapes = shapes;
    if (next.objects) before.objects = objects;
    if (activeView.locked && (next.shapes || next.objects)) return;
    record({ kind: "content", map: map.id, layer: layerId, before, after: next });
    storeContent(map.id, layerId, next);
  }
  const saveEdges = (walls: MapEdge[]) => saveContent({ walls });
  const saveShapes = (next: MapShape[]) => saveContent({ shapes: next });
  const saveObjects = (next: MapObject[]) => saveContent({ objects: next });
  const saveFog = (mask: Uint8Array) => saveContent({ fog: maskToText(mask) });

  /**
   * Tire un donjon et remplace le dessin du calque principal (sols, murs, portes, objets).
   * Les pions et les autres calques restent ; Ctrl+Z ramène le dessin d'avant.
   */
  async function drawDungeon() {
    if (!map) return;
    const drawn = baseShapes.length > 0 || edges.length > 0 || baseObjects.length > 0;
    if (drawn && lastDungeon.current !== map.shapes) {
      const ok = await confirmAction({
        title: "Remplacer le dessin de cette carte ?",
        message:
          "Les sols, murs, portes et objets du calque principal laissent place au donjon. Les pions et les autres calques restent. Ctrl+Z pour revenir.",
      });
      if (!ok) return;
    }
    const d = generateDungeon(dungeon, Math.floor(Math.random() * 2 ** 31));
    if (d.width !== map.width || d.height !== map.height)
      patchMap({ width: d.width, height: d.height });
    const after = { walls: d.edges, shapes: d.shapes, objects: d.objects };
    record({
      kind: "content",
      map: map.id,
      layer: null,
      before: { walls: edges, shapes: baseShapes, objects: baseObjects },
      after,
    });
    storeContent(map.id, null, after);
    lastDungeon.current = d.shapes;
  }

  const [exportOpts, setExportOpts] = useState({
    ppc: 70,
    type: "image/png" as "image/png" | "image/jpeg",
    tokens: true,
    night: true,
  });
  const [exporting, setExporting] = useState(false);
  async function exportImage(print: boolean) {
    const svg = document.querySelector<SVGSVGElement>(".map-stage .map-board");
    if (!map || !svg) return;
    setExporting(true);
    try {
      const blob = await mapImage(svg, map.width, map.height, 40, {
        ...exportOpts,
        type: print ? "image/png" : exportOpts.type,
        night: exportOpts.night && lightSettings.on,
        dark: lightSettings.dark,
      });
      if (!print)
        return download(blob, fileName(map.name, exportOpts.type === "image/png" ? "png" : "jpg"));
      // Impression : le navigateur propose aussi « Enregistrer en PDF »
      const url = URL.createObjectURL(blob);
      const w = window.open("", "_blank");
      if (!w) return setErr("Le navigateur a bloqué la fenêtre d’impression.");
      w.document.title = map.name;
      const style = w.document.createElement("style");
      style.textContent =
        "@page{size:landscape;margin:10mm}html,body{margin:0;height:100%}img{display:block;max-width:100%;max-height:100vh;margin:auto}";
      const img = w.document.createElement("img");
      img.onload = () => {
        w.focus();
        w.print();
      };
      img.src = url;
      w.document.head.appendChild(style);
      w.document.body.appendChild(img);
    } catch (e) {
      setErr(`Export impossible : ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }
  function saveFile() {
    if (!map) return;
    const file: MapFile = {
      format: FILE_FORMAT,
      version: FILE_VERSION,
      map: {
        name: map.name,
        width: map.width,
        height: map.height,
        place: map.place,
        level: map.level,
        walls: edges,
        shapes: baseShapes,
        objects: baseObjects,
        style: (map.style ?? {}) as Record<string, unknown>,
        light: lightSettings,
        manual_fog: map.manual_fog,
        fog_mask: map.fog_mask,
        cell_value: map.cell_value,
        cell_unit: map.cell_unit,
        show_grid: map.show_grid,
        fog: map.fog,
        vision_mode: map.vision_mode,
        vision_range: map.vision_range,
        vision_corners: map.vision_corners,
      },
      layers: mapLayers.map((l) => ({
        name: l.name,
        position: l.position,
        hidden: l.hidden,
        locked: l.locked,
        shapes: readShapes(l.shapes),
        objects: readObjects(l.objects),
      })),
      tokens: onMap.flatMap((t) =>
        t.kind === "enemy" || t.kind === "ally"
          ? [
              {
                kind: t.kind,
                label: t.label,
                x: t.x,
                y: t.y,
                hidden: t.hidden,
                size: t.size,
                color: t.color,
              },
            ]
          : [],
      ),
    };
    const json = JSON.stringify({
      ...file,
      map: {
        ...file.map,
        shapes: shapesToJson(file.map.shapes),
        objects: objectsToJson(file.map.objects),
      },
      layers: file.layers.map((l) => ({
        ...l,
        shapes: shapesToJson(l.shapes),
        objects: objectsToJson(l.objects),
      })),
    });
    download(new Blob([json], { type: "application/json" }), fileName(map.name, "carte.json"));
  }
  /** Ouvre un fichier de carte : une nouvelle carte, ses calques et ses ennemis et alliés. */
  async function importFile(f: File) {
    if (f.size > 5_000_000) return setErr("Fichier trop gros pour une carte.");
    const file = readMapFile(await f.text());
    if (!file) return setErr("Ce fichier n’est pas une carte de la table.");
    const { name, shapes: sh, objects: ob, walls, style, light, ...rest } = file.map;
    const { data, error } = await supabase
      .from("maps")
      .insert({
        ...rest,
        name: `${name} (importée)`.slice(0, 60),
        walls: walls as unknown as Json,
        shapes: shapesToJson(sh) as unknown as Json,
        objects: objectsToJson(ob) as unknown as Json,
        style: style as Json,
        light: light as Json,
      })
      .select("id")
      .single();
    if (error) return setErr(error.message);
    if (file.layers.length) {
      const { error: e2 } = await supabase.from("map_layers").insert(
        file.layers.map((l) => ({
          ...l,
          map_id: data.id,
          shapes: shapesToJson(l.shapes) as unknown as Json,
          objects: objectsToJson(l.objects) as unknown as Json,
        })),
      );
      if (e2) setErr(e2.message);
    }
    if (file.tokens.length) {
      const { error: e3 } = await supabase
        .from("map_tokens")
        .insert(file.tokens.map((t) => ({ ...t, map_id: data.id })));
      if (e3) setErr(e3.message);
    }
    await load();
    goToMap(data.id);
    setPanel(null);
  }
  function saveLight(next: LightSettings) {
    if (!mapId) return;
    const target = mapId;
    setMaps((list) => list?.map((m) => (m.id === target ? { ...m, light: next } : m)) ?? list);
    write(() =>
      supabase
        .from("maps")
        .update({ light: next as unknown as Json })
        .eq("id", target),
    );
  }

  /**
   * Retouche d'un objet depuis sa barre (couleur, opacité…) : l'écran suit tout de suite,
   * les retouches rapprochées d'un même objet forment une seule annulation et une seule écriture.
   */
  function patchObject(objectId: string, patch: Partial<MapObject>) {
    if (!map) return;
    const target = map.id;
    const next = updateObject(objects, objectId, patch);
    const now = Date.now();
    const last = past.current.at(-1);
    const same = lastPatch.current?.id === objectId && now - lastPatch.current.t < 800;
    if (
      same &&
      last?.kind === "content" &&
      last.map === target &&
      last.layer === layerId &&
      last.after.objects
    )
      last.after = { objects: next };
    else
      record({
        kind: "content",
        map: target,
        layer: layerId,
        before: { objects },
        after: { objects: next },
      });
    lastPatch.current = { id: objectId, t: now };
    showContent(target, layerId, { objects: next });
    pendingObjects.current = { map: target, layer: layerId, list: next };
    if (objectTimer.current) clearTimeout(objectTimer.current);
    objectTimer.current = setTimeout(flushObjects, 350);
  }
  function placeObject(p: Point) {
    const size = (k: MapObject["k"]) =>
      k === "stairs"
        ? { w: 1, h: 2, steps: 3 }
        : k === "text"
          ? { w: 1, h: 0.6 }
          : k === "image"
            ? { w: 2, h: 2 }
            : { w: 1, h: 1 };
    let base: Omit<MapObject, "id" | "x" | "y" | "r"> | null = null;
    if (placeKind === "stairs") base = { k: "stairs", ...size("stairs") };
    else if (placeKind === "light")
      base = { k: "light", w: 0.8, h: 0.8, rad: 4, bright: 0.5, color: "#ffc766" };
    else if (placeKind === "text") base = { k: "text", text: "Texte", ...size("text") };
    else if (placeKind === "source" && source)
      base =
        source.k === "symbol"
          ? { k: "symbol", sym: source.sym, ...size("symbol") }
          : { k: "image", src: source.src, ...size("image") };
    if (!base || !map) return;
    const draft: MapObject = { ...base, id: newObjectId(objects), x: p.x, y: p.y, r: 0 };
    const placed = { ...draft, ...snapObjectCenter(p, draft, objectSnap, map.width, map.height) };
    saveObjects([...objects, placed]);
    setSelectedObject(placed.id);
    // Un texte se règle aussitôt : on repasse en sélection pour le modifier
    if (placeKind === "text") setPlaceKind("select");
  }
  function removeObject(objectId: string) {
    saveObjects(objects.filter((o) => o.id !== objectId));
    setSelectedObject(null);
  }
  function duplicateObject(o: MapObject) {
    const copy = { ...o, id: newObjectId(objects), x: o.x + 1, y: o.y + 1 };
    saveObjects([...objects, copy]);
    setSelectedObject(copy.id);
  }
  async function uploadObjectImage(f: File) {
    if (!teamId) return;
    const problem = validateAvatar(f);
    if (problem) return setErr(problem);
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${/^[a-z0-9]{1,5}$/.test(ext) ? ext : "png"}`;
    const path = `${teamId}/objets/${name}`;
    const { error } = await supabase.storage.from("maps").upload(path, f, { contentType: f.type });
    if (error) return setErr(error.message);
    setLibrary((l) => [path, ...l]);
    chooseSource({ k: "image", src: path });
  }
  async function removeObjectImage(src: string) {
    const ok = await confirmAction({
      title: "Supprimer cette image de la bibliothèque ?",
      message:
        "Les objets qui l’utilisent disparaîtront de cette carte, et resteront vides sur les autres.",
    });
    if (!ok) return;
    const { error } = await supabase.storage.from("maps").remove([src]);
    if (error) return setErr(error.message);
    setLibrary((l) => l.filter((x) => x !== src));
    if (source?.k === "image" && source.src === src) setSource(null);
    if (objects.some((o) => o.src === src)) saveObjects(objects.filter((o) => o.src !== src));
  }
  function chooseSource(next: ObjectSource) {
    setSource(next);
    if (tool !== "stamp") {
      setTool("object");
      setPlaceKind("source");
    }
    setPanel(null);
  }
  const content = () => ({ shapes, edges, objects });
  function copyArea(cut: boolean) {
    if (!map || !zone) return;
    setClip(copyZone(zone, content(), map.width, map.height));
    if (cut) clearArea();
  }
  function clearArea() {
    if (!map || !zone) return;
    const r = clearZone(zone, content(), map.width, map.height);
    saveContent({ walls: r.edges, shapes: r.shapes, objects: r.objects });
    setZone(null);
  }
  function pasteArea(p: Point) {
    if (!map || !clip) return;
    const r = pasteClip(clip, p, content(), map.width, map.height);
    saveContent({ walls: r.edges, shapes: r.shapes, objects: r.objects });
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
  /** L'écran suit le réglage tout de suite ; l'écriture attend la fin du geste (sélecteur de couleur). */
  function saveStyle(next: MapStyle) {
    if (!mapId) return;
    const target = mapId;
    const style = styleToJson(next);
    setMaps((list) => list?.map((m) => (m.id === target ? { ...m, style } : m)) ?? list);
    if (styleTimer.current) clearTimeout(styleTimer.current);
    styleTimer.current = setTimeout(() => {
      styleTimer.current = null;
      write(() =>
        supabase
          .from("maps")
          .update({ style: style as Json })
          .eq("id", target),
      );
    }, 350);
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
      hidden: placeHidden,
      ...p,
    });
  };
  function choosePlaceHidden(next: boolean) {
    setPlaceHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, next ? "1" : "0");
    } catch {
      /* rien : simple confort */
    }
  }
  function revealAll() {
    const ids = onMap.filter((t) => t.hidden).map((t) => t.id);
    if (!ids.length || !mapId) return;
    setTokens((list) => list.map((t) => (ids.includes(t.id) ? { ...t, hidden: false } : t)));
    write(() => supabase.from("map_tokens").update({ hidden: false }).in("id", ids));
  }
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

  async function addLayer() {
    if (!map || mapLayers.length >= LAYERS_MAX) return;
    const { data, error } = await supabase
      .from("map_layers")
      .insert({
        map_id: map.id,
        name: nextLabel(
          "Calque",
          mapLayers.map((l) => l.name),
        ),
        position: nextPosition(mapLayers),
      })
      .select(LAYER_COLUMNS)
      .single();
    if (error) return setErr(error.message);
    setLayers((list) => [...list, data as LayerRow]);
    setActiveLayer((data as LayerRow).id);
  }
  function patchLayer(
    layer: string,
    patch: { name?: string; hidden?: boolean; locked?: boolean; position?: number },
  ) {
    setLayers((list) => list.map((l) => (l.id === layer ? { ...l, ...patch } : l)));
    write(() => supabase.from("map_layers").update(patch).eq("id", layer));
    // Un calque masqué n'envoie plus rien aux joueurs : la carte, elle, les prévient de recharger
    if (patch.hidden !== undefined && mapId)
      write(() =>
        supabase.from("maps").update({ updated_at: new Date().toISOString() }).eq("id", mapId),
      );
  }
  function moveLayer(layer: string, dir: 1 | -1) {
    const swapped = swapLayer(mapLayers, layer, dir);
    if (!swapped) return;
    for (const l of swapped) patchLayer(l.id, { position: l.position });
  }
  async function deleteLayer(l: LayerRow) {
    const ok = await confirmAction({
      title: `Supprimer le calque « ${l.name} » ?`,
      message:
        "Ses sols et ses objets seront perdus. Les murs et portes, eux, restent sur la carte.",
    });
    if (!ok) return;
    flushObjects();
    const { error } = await supabase.from("map_layers").delete().eq("id", l.id);
    if (error) return setErr(error.message);
    setLayers((list) => list.filter((x) => x.id !== l.id));
    // Plus rien à annuler dans un calque disparu
    past.current = past.current.filter((op) => op.kind !== "content" || op.layer !== l.id);
    future.current = future.current.filter((op) => op.kind !== "content" || op.layer !== l.id);
    setCanStep({ undo: past.current.length > 0, redo: future.current.length > 0 });
    if (activeLayer === l.id) setActiveLayer(null);
  }
  function goToMap(target: string) {
    setCurrentId(target);
    setSelected(null);
    setSelectedObject(null);
  }
  /** Nouvel étage du même lieu, au-dessus du plus haut : même taille et même apparence, vide. */
  async function createFloor() {
    if (!map || !maps) return;
    const place = (map.place?.trim() || map.name).slice(0, 40);
    if (!map.place?.trim()) patchMap({ place });
    const same = maps.filter((m) => m.place?.trim().toLowerCase() === place.toLowerCase());
    const level = Math.max(map.level, ...same.map((m) => m.level)) + 1;
    const { data, error } = await supabase
      .from("maps")
      .insert({
        name: `${place} · ${levelLabel(level)}`.slice(0, 60),
        place,
        level,
        width: map.width,
        height: map.height,
        style: (map.style ?? {}) as Json,
        cell_value: map.cell_value,
        cell_unit: map.cell_unit,
        show_grid: map.show_grid,
        fog: map.fog,
        vision_mode: map.vision_mode,
        vision_range: map.vision_range,
        vision_corners: map.vision_corners,
      })
      .select("id")
      .single();
    if (error) return setErr(error.message);
    await load();
    goToMap(data.id);
  }
  /**
   * Le groupe prend l'escalier : ses pions passent sur l'autre carte, près de l'objet qui
   * ramène ici (sinon au centre). Si cette carte était affichée, la table suit.
   */
  async function bringParty(target: string) {
    const dest = maps?.find((m) => m.id === target);
    if (!map || !dest) return;
    const destObjects = [
      ...readObjects(dest.objects),
      ...layers.filter((l) => l.map_id === target).flatMap((l) => readObjects(l.objects)),
    ];
    const back = destObjects.find((o) => o.link === map.id);
    const members = onMap.filter((t) => t.kind === "party");
    const spots = partySpots(
      back ?? { x: dest.width / 2, y: dest.height / 2 },
      members.length,
      dest.width,
      dest.height,
    );
    await queue.current.flush();
    for (const [i, t] of members.entries()) {
      const there = tokens.find((x) => x.map_id === target && x.character_id === t.character_id);
      if (there) await supabase.from("map_tokens").delete().eq("id", there.id);
      const { error } = await supabase
        .from("map_tokens")
        .update({ map_id: target, ...spots[i]! })
        .eq("id", t.id);
      if (error) setErr(error.message);
    }
    if (isLiveMap) await setLive(target);
    await load();
    goToMap(target);
  }
  async function createMap(from?: MapRow) {
    const { data, error } = await supabase
      .from("maps")
      .insert({
        name: from ? `${from.name} (copie)`.slice(0, 60) : `Carte ${(maps?.length ?? 0) + 1}`,
        width: from?.width ?? 24,
        height: from?.height ?? 16,
        walls: (from?.walls ?? []) as Json,
        shapes: (from?.shapes ?? []) as Json,
        style: (from?.style ?? {}) as Json,
        objects: (from?.objects ?? []) as Json,
        cell_value: from?.cell_value ?? 1,
        cell_unit: from?.cell_unit ?? "case",
        show_grid: from?.show_grid ?? true,
        fog: from?.fog ?? false,
        vision_mode: from?.vision_mode ?? "sight",
        vision_range: from?.vision_range ?? 0,
        vision_corners: from?.vision_corners ?? false,
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
      const layerCopies = layers
        .filter((l) => l.map_id === from.id)
        .map(({ id: _id, map_id: _map, shapes: sh, objects: ob, ...l }) => ({
          ...l,
          map_id: data.id,
          shapes: sh as Json,
          objects: ob as Json,
        }));
      if (layerCopies.length) {
        const { error: e3 } = await supabase.from("map_layers").insert(layerCopies);
        if (e3) setErr(e3.message);
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
      else if (key === "d" && tool === "object" && chosenObject) duplicateObject(chosenObject);
      else if (key === "d" && chosen) duplicateToken(chosen);
      else if ((key === "c" || key === "x") && tool === "zone" && zone) copyArea(key === "x");
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      if (popup) onClose?.();
      if (full) setFull(false);
      setSelected(null);
      setSelectedObject(null);
      setZone(null);
      setTool("move");
      return;
    }
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      canEdit &&
      tool === "object" &&
      chosenObject
    ) {
      removeObject(chosenObject.id);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && canEdit && tool === "zone" && zone) {
      clearArea();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && canEdit && chosen) {
      void removeToken(chosen);
      return;
    }
    if (tool === "shape" && canEdit) {
      if (key === "x") return shapeOpt({ erase: !shapeSettings.erase });
      if (key === "s")
        return shapeOpt({ snap: shapeSettings.snap === 1 ? 0.5 : shapeSettings.snap ? 0 : 1 });
      if (key === "[" || key === "]") {
        const d = key === "]" ? 1 : -1;
        if (shapeSettings.kind === "path")
          return shapeOpt({ width: Math.min(6, Math.max(1, shapeSettings.width + d)) });
        if (shapeSettings.kind === "ellipse") {
          const at = Math.max(0, SIDES.indexOf(shapeSettings.sides) + d);
          return shapeOpt({ sides: SIDES[Math.min(SIDES.length - 1, at)] ?? 0 });
        }
      }
    }
    if (key === "h" && canEdit) {
      if (chosen) patchToken(chosen.id, { hidden: !chosen.hidden });
      else choosePlaceHidden(!placeHidden);
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
      className={popup ? "map-popup" : screen ? "map-screen map-tv" : "map-screen"}
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
            shapes={shapes}
            shapeSettings={shapeSettings}
            mapStyle={mapStyle}
            allShapes={allShapes}
            ghostShapes={ghostShapes}
            layerObjects={layerObjects}
            activeLayer={layerId}
            locked={activeView.locked}
            objects={objects}
            objectUrls={objectUrls}
            selectedObject={selectedObject}
            placing={placeKind !== "select" && (placeKind !== "source" || !!source)}
            objectSnap={objectSnap}
            stampSource={source}
            stamp={stamp}
            zone={zone}
            clip={clip}
            onObjects={saveObjects}
            onSelectObject={setSelectedObject}
            onPlaceObject={placeObject}
            onZone={setZone}
            onPaste={pasteArea}
            light={lightSettings}
            manualFog={map.manual_fog}
            fogMask={fogMask}
            fogBrush={fogBrush}
            onFogMask={saveFog}
            tokens={onMap}
            party={party}
            tool={tool}
            doorType={doorType}
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
            visionRule={{
              mode: map.vision_mode,
              range: map.vision_range / map.cell_value,
              corners: map.vision_corners,
            }}
            cellValue={map.cell_value}
            cellUnit={map.cell_unit}
            pings={pings}
            focus={focus}
            onEdges={saveEdges}
            onShapes={saveShapes}
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

        {screen && (
          <Button
            className="map-tv-full"
            title="Plein écran"
            onClick={() =>
              void document.documentElement.requestFullscreen?.().catch(() => undefined)
            }
          >
            <Expand size={16} aria-hidden="true" /> Plein écran
          </Button>
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
              {map.place?.trim() && (
                <span className="map-floors" role="group" aria-label="Étages">
                  <Button
                    aria-label="Étage au-dessus"
                    title={neighborFloor(maps, map, 1)?.name ?? "Pas d’étage au-dessus"}
                    disabled={!neighborFloor(maps, map, 1)}
                    onClick={() => {
                      const up = neighborFloor(maps, map, 1);
                      if (up) goToMap(up.id);
                    }}
                  >
                    <ChevronUp size={16} />
                  </Button>
                  <small>{levelLabel(map.level)}</small>
                  <Button
                    aria-label="Étage en dessous"
                    title={neighborFloor(maps, map, -1)?.name ?? "Pas d’étage en dessous"}
                    disabled={!neighborFloor(maps, map, -1)}
                    onClick={() => {
                      const down = neighborFloor(maps, map, -1);
                      if (down) goToMap(down.id);
                    }}
                  >
                    <ChevronDown size={16} />
                  </Button>
                </span>
              )}
              <Button
                className={`map-layer-chip ${layerId ? "on" : ""}`}
                title="Calques : choisir où dessiner, cacher aux joueurs, verrouiller"
                aria-pressed={panel === "layers"}
                onClick={() => setPanel((p) => (p === "layers" ? null : "layers"))}
              >
                <Layers size={15} aria-hidden="true" />
                {activeView.locked && <Lock size={12} aria-label="verrouillé" />}
                <span>{activeView.name}</span>
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
                aria-label="Exporter"
                title="Exporter, imprimer, écran de table"
                aria-pressed={panel === "export"}
                onClick={() => setPanel((p) => (p === "export" ? null : "export"))}
              >
                <Download size={16} />
              </Button>
              <Button
                aria-label="Donjon aléatoire"
                title="Donjon aléatoire"
                aria-pressed={panel === "dungeon"}
                onClick={() => setPanel((p) => (p === "dungeon" ? null : "dungeon"))}
              >
                <Dices size={16} />
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

        {canEdit && map && (tool === "enemy" || tool === "ally") && (
          <div className="map-door-types" role="radiogroup" aria-label="Pose des pions">
            <Button
              role="radio"
              aria-checked={!placeHidden}
              title="Les joueurs verront ce pion"
              onClick={() => choosePlaceHidden(false)}
            >
              <Eye size={15} aria-hidden="true" /> Visible
            </Button>
            <Button
              role="radio"
              aria-checked={placeHidden}
              title="Caché aux joueurs jusqu’à ce que tu le révèles (H)"
              onClick={() => choosePlaceHidden(true)}
            >
              <EyeOff size={15} aria-hidden="true" /> Caché
            </Button>
          </div>
        )}
        {canEdit && map && tool === "object" && (
          <>
            <div className="map-door-types" role="radiogroup" aria-label="Poser un objet">
              <Button
                role="radio"
                aria-checked={placeKind === "select"}
                title="Choisir, déplacer, agrandir (coin) ou tourner (poignée du haut) un objet"
                onClick={() => setPlaceKind("select")}
              >
                Choisir
              </Button>
              <Button
                role="radio"
                aria-checked={placeKind === "source"}
                title="Poser le symbole ou l’image de la bibliothèque"
                onClick={() => (source ? setPlaceKind("source") : setPanel("library"))}
              >
                <SourcePreview source={source} urls={objectUrls} /> Symbole
              </Button>
              <Button
                role="radio"
                aria-checked={placeKind === "stairs"}
                title="Poser un escalier"
                onClick={() => setPlaceKind("stairs")}
              >
                Escalier
              </Button>
              <Button
                role="radio"
                aria-checked={placeKind === "text"}
                title="Poser un texte : nom de lieu, numéro de salle"
                onClick={() => setPlaceKind("text")}
              >
                Texte
              </Button>
              <Button
                role="radio"
                aria-checked={placeKind === "light"}
                title="Poser une lumière (visible quand l’éclairage est allumé)"
                onClick={() => setPlaceKind("light")}
              >
                Lumière
              </Button>
              <span className="map-sep" aria-hidden="true" />
              <Button title="Symboles et images" onClick={() => setPanel("library")}>
                Bibliothèque
              </Button>
              <span className="map-sep" aria-hidden="true" />
              <Pick label="Aimant" value={objectSnap} options={SNAPS} onChange={setObjectSnap} />
            </div>
            {chosenObject && (
              <ObjectEditor
                o={chosenObject}
                onChange={(patch) => patchObject(chosenObject.id, patch)}
                onFront={() => saveObjects(restack(objects, chosenObject.id, true))}
                onBack={() => saveObjects(restack(objects, chosenObject.id, false))}
                onDuplicate={() => duplicateObject(chosenObject)}
                onRemove={() => removeObject(chosenObject.id)}
                maps={maps.filter((m) => m.id !== map.id).map((m) => ({ id: m.id, name: m.name }))}
                onGo={goToMap}
                onBring={(target) => void bringParty(target)}
                cellValue={map.cell_value}
                cellUnit={map.cell_unit}
              />
            )}
          </>
        )}
        {canEdit && map && tool === "stamp" && (
          <div className="map-door-types" aria-label="Réglages du tampon">
            <Button
              title="Choisir le symbole ou l’image à répéter"
              onClick={() => setPanel("library")}
            >
              <SourcePreview source={source} urls={objectUrls} /> {source ? "Changer" : "Choisir"}
            </Button>
            <span className="map-sep" aria-hidden="true" />
            <Pick
              label="Écart"
              value={stamp.spacing}
              options={[0.5, 1, 2].map((v) => ({ value: v, label: String(v).replace(".", ",") }))}
              onChange={(spacing) => setStamp((st) => ({ ...st, spacing }))}
            />
            <Pick
              label="Taille"
              value={STAMP_SIZES.find((z) => z.min === stamp.min)?.value ?? "m"}
              options={STAMP_SIZES}
              onChange={(v) => {
                const z = STAMP_SIZES.find((x) => x.value === v) ?? STAMP_SIZES[1]!;
                setStamp((st) => ({ ...st, min: z.min, max: z.max }));
              }}
            />
            <Pick
              label="Rotation"
              value={stamp.spin}
              options={[
                { value: true, label: "Au hasard" },
                { value: false, label: "Droite" },
              ]}
              onChange={(spin) => setStamp((st) => ({ ...st, spin }))}
            />
            <Pick
              label="Dispersion"
              value={stamp.scatter}
              options={[
                { value: 0, label: "0" },
                { value: 0.4, label: "Un peu" },
                { value: 1, label: "Beaucoup" },
              ]}
              onChange={(scatter) => setStamp((st) => ({ ...st, scatter }))}
            />
          </div>
        )}
        {canEdit && map && tool === "fog" && (
          <div className="map-door-types" aria-label="Brouillard à la main">
            {!map.manual_fog && (
              <>
                <span className="note plain map-hint">Le brouillard à la main est éteint.</span>
                <Button onClick={() => patchMap({ manual_fog: true })}>Allumer</Button>
                <span className="map-sep" aria-hidden="true" />
              </>
            )}
            <Pick
              label="Outil"
              value={fogBrush.mode}
              options={[
                { value: "brush" as const, label: "Pinceau", hint: "Glisse sur les cases" },
                {
                  value: "room" as const,
                  label: "Pièce",
                  hint: "Touche une pièce : jusqu’aux murs et portes fermées",
                },
              ]}
              onChange={(mode) => setFogBrush((b) => ({ ...b, mode }))}
            />
            <Pick
              label="Action"
              value={fogBrush.reveal}
              options={[
                { value: true, label: "Révéler" },
                { value: false, label: "Cacher" },
              ]}
              onChange={(reveal) => setFogBrush((b) => ({ ...b, reveal }))}
            />
            {fogBrush.mode === "brush" && (
              <Pick
                label="Taille"
                value={fogBrush.size}
                options={[1, 2, 3, 5].map((n) => ({ value: n, label: String(n) }))}
                onChange={(size) => setFogBrush((b) => ({ ...b, size }))}
              />
            )}
            <Button onClick={() => saveFog(fillMask(true, map.width, map.height))}>
              Tout révéler
            </Button>
            <Button onClick={() => saveFog(fillMask(false, map.width, map.height))}>
              Tout cacher
            </Button>
          </div>
        )}
        {canEdit && map && tool === "zone" && (
          <div className="map-door-types" aria-label="Zone">
            {zone ? (
              <>
                <Button title="Copier la zone (Ctrl+C)" onClick={() => copyArea(false)}>
                  Copier
                </Button>
                <Button title="Copier puis vider la zone (Ctrl+X)" onClick={() => copyArea(true)}>
                  Couper
                </Button>
                <Button
                  title="Retirer sols, murs, portes et objets de la zone (Suppr)"
                  onClick={clearArea}
                >
                  Vider
                </Button>
              </>
            ) : (
              <span className="note plain map-hint">Glisse pour choisir une zone.</span>
            )}
            {clip && (
              <>
                <span className="map-sep" aria-hidden="true" />
                <span className="note plain map-hint">
                  Copie de {clip.w} × {clip.h} : touche la carte pour la coller.
                </span>
                <Button onClick={() => setClip(null)}>Oublier</Button>
              </>
            )}
          </div>
        )}
        {canEdit && map && panel === "export" && (
          <Panel title="Exporter" onClose={() => setPanel(null)}>
            <h3>Image</h3>
            <div className="map-gen">
              <Pick
                label="Format"
                value={exportOpts.type}
                options={[
                  { value: "image/png" as const, label: "PNG", hint: "Meilleure qualité" },
                  { value: "image/jpeg" as const, label: "JPG", hint: "Plus léger" },
                ]}
                onChange={(type) => setExportOpts((o) => ({ ...o, type }))}
              />
              <Pick
                label="Pixels par case"
                value={exportOpts.ppc}
                options={[50, 70, 100, 140].map((n) => ({
                  value: n,
                  label: String(n),
                  ...(n === 70 ? { hint: "La taille usuelle des tables virtuelles" } : {}),
                }))}
                onChange={(ppc) => setExportOpts((o) => ({ ...o, ppc }))}
              />
            </div>
            {(() => {
              const z = imageSize(map.width, map.height, 40, exportOpts.ppc);
              return (
                <p className="note plain">
                  {map.width} × {map.height} cases → {z.width} × {z.height} pixels
                  {z.reduced ? " (réduite pour rester lisible partout)" : ""}.
                </p>
              );
            })()}
            <Switch
              label="Avec les pions"
              value={exportOpts.tokens}
              onChange={(tokens) => setExportOpts((o) => ({ ...o, tokens }))}
            />
            {lightSettings.on && (
              <Switch
                label="Avec la nuit et les lumières"
                value={exportOpts.night}
                onChange={(night) => setExportOpts((o) => ({ ...o, night }))}
              />
            )}
            <p className="note plain">
              L’image montre toute la carte, sans brouillard ni outils. Les calques cachés n’y sont
              pas.
            </p>
            <div className="map-row">
              <Button
                className="btn y"
                disabled={exporting}
                onClick={() => void exportImage(false)}
              >
                <Download size={15} aria-hidden="true" /> Télécharger
              </Button>
              <Button className="btn" disabled={exporting} onClick={() => void exportImage(true)}>
                <Printer size={15} aria-hidden="true" /> Imprimer ou PDF
              </Button>
            </div>
            <h3>Fichier</h3>
            <p className="note plain">
              Sauvegarde toute la carte (sols, murs, objets, calques, ennemis et alliés) dans un
              fichier, pour la garder ou la passer à un autre MJ. Les images importées restent
              propres à ta table.
            </p>
            <div className="map-row">
              <Button className="btn" onClick={saveFile}>
                <Download size={15} aria-hidden="true" /> Enregistrer
              </Button>
              <input
                id="map-file"
                type="file"
                accept=".json,application/json"
                className="profile-file"
                aria-label="Ouvrir une carte"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                  e.target.value = "";
                }}
              />
              <label className="btn" htmlFor="map-file">
                <FileUp size={15} aria-hidden="true" /> Ouvrir
              </label>
            </div>
            <h3>Écran de table</h3>
            <p className="note plain">
              Une fenêtre sans interface avec la carte affichée, comme la voient les joueurs :
              glisse-la sur une télé ou un écran posé sur la table, puis passe-la en plein écran.
            </p>
            <Button
              className="btn"
              onClick={() => window.open("/carte?ecran=1", "table-jdr-ecran")}
            >
              <Monitor size={15} aria-hidden="true" /> Ouvrir l’écran de table
            </Button>
          </Panel>
        )}
        {canEdit && map && panel === "dungeon" && (
          <Panel title="Donjon aléatoire" onClose={() => setPanel(null)}>
            <p className="note plain">
              Remplace le dessin du calque principal par un donjon tout prêt, à retoucher ensuite.
              Chaque tirage est différent ; Ctrl+Z ramène le précédent.
            </p>
            <div className="map-gen">
              <Pick
                label="Taille"
                value={dungeon.size}
                options={[
                  { value: "s" as const, label: "Petite" },
                  { value: "m" as const, label: "Moyenne" },
                  { value: "l" as const, label: "Grande" },
                ]}
                onChange={(size) => setDungeon((d) => ({ ...d, size }))}
              />
              <Pick
                label="Pièces"
                value={dungeon.rooms}
                options={[
                  { value: 4, label: "Peu" },
                  { value: 7, label: "Quelques-unes" },
                  { value: 11, label: "Nombreuses" },
                  { value: 16, label: "Beaucoup" },
                ]}
                onChange={(rooms) => setDungeon((d) => ({ ...d, rooms }))}
              />
              <Pick
                label="Taille des pièces"
                value={dungeon.roomSize}
                options={[
                  { value: "tight" as const, label: "Exiguës" },
                  { value: "normal" as const, label: "Normales" },
                  { value: "wide" as const, label: "Spacieuses" },
                ]}
                onChange={(roomSize) => setDungeon((d) => ({ ...d, roomSize }))}
              />
              <Pick
                label="Couloirs"
                value={dungeon.corridor}
                options={[
                  { value: "short" as const, label: "Courts" },
                  { value: "normal" as const, label: "Normaux" },
                  { value: "long" as const, label: "Longs" },
                ]}
                onChange={(corridor) => setDungeon((d) => ({ ...d, corridor }))}
              />
              <Pick
                label="Largeur des couloirs"
                value={dungeon.corridorWidth}
                options={[
                  { value: 1 as const, label: "Étroits" },
                  { value: 2 as const, label: "Larges", hint: "Sans portes" },
                ]}
                onChange={(corridorWidth) => setDungeon((d) => ({ ...d, corridorWidth }))}
              />
              <Pick
                label="Disposition"
                value={dungeon.layout}
                options={[
                  { value: "line" as const, label: "En ligne" },
                  { value: "branch" as const, label: "Ramifiée" },
                  { value: "balanced" as const, label: "Équilibrée", hint: "Avec des boucles" },
                  { value: "winding" as const, label: "Sinueuse" },
                ]}
                onChange={(layout) => setDungeon((d) => ({ ...d, layout }))}
              />
              <Pick
                label="Portes"
                value={dungeon.doors}
                options={[
                  { value: 0, label: "Aucune" },
                  { value: 0.25, label: "Peu" },
                  { value: 0.5, label: "Quelques-unes" },
                  { value: 0.9, label: "Nombreuses" },
                ]}
                onChange={(doors) => setDungeon((d) => ({ ...d, doors }))}
              />
              <div className="map-opt" role="group" aria-label="Formes des pièces">
                <small aria-hidden="true">Formes</small>
                {(
                  [
                    ["square", "Carrées"],
                    ["irregular", "Irrégulières"],
                    ["round", "Arrondies"],
                  ] as const
                ).map(([k, label]) => (
                  <Button
                    key={k}
                    aria-pressed={dungeon.shapes[k]}
                    onClick={() =>
                      setDungeon((d) => {
                        const shapes = { ...d.shapes, [k]: !d.shapes[k] };
                        // Il reste toujours au moins une forme
                        return Object.values(shapes).some(Boolean) ? { ...d, shapes } : d;
                      })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <Pick
                label="Usure"
                value={dungeon.wear}
                options={[
                  { value: 0, label: "Aucune" },
                  { value: 1, label: "Légère" },
                  { value: 2, label: "Moyenne" },
                  { value: 3, label: "Marquée" },
                ]}
                onChange={(wear) => setDungeon((d) => ({ ...d, wear }))}
              />
            </div>
            <Switch
              label="Numéroter les salles"
              value={dungeon.numbers}
              onChange={(numbers) => setDungeon((d) => ({ ...d, numbers }))}
            />
            <Button className="btn y" onClick={() => void drawDungeon()}>
              <Dices size={15} aria-hidden="true" /> Générer
            </Button>
          </Panel>
        )}
        {canEdit && map && panel === "layers" && (
          <Panel title="Calques" onClose={() => setPanel(null)}>
            <p className="note plain">
              Tu dessines dans le calque choisi. Un calque caché n’est jamais envoyé aux joueurs :
              idéal pour une salle secrète, que tu vois en violet pointillé.
            </p>
            <div className="map-layers" role="radiogroup" aria-label="Calque où dessiner">
              {[...mapLayers].reverse().map((l, i) => (
                <div key={l.id} className={`map-layer ${layerId === l.id ? "on" : ""}`}>
                  <Button
                    role="radio"
                    aria-checked={layerId === l.id}
                    className="map-layer-pick"
                    onClick={() => setActiveLayer(l.id)}
                  >
                    <i aria-hidden="true" />
                  </Button>
                  <input
                    key={`${l.id}-${l.name}`}
                    className="field"
                    aria-label="Nom du calque"
                    defaultValue={l.name}
                    maxLength={40}
                    onFocus={() => setActiveLayer(l.id)}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== l.name) patchLayer(l.id, { name });
                      else e.target.value = l.name;
                    }}
                  />
                  <Button
                    aria-label={l.hidden ? "Montrer aux joueurs" : "Cacher aux joueurs"}
                    title={l.hidden ? "Caché aux joueurs" : "Visible des joueurs"}
                    aria-pressed={l.hidden}
                    className={l.hidden ? "warn" : ""}
                    onClick={() => patchLayer(l.id, { hidden: !l.hidden })}
                  >
                    {l.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </Button>
                  <Button
                    aria-label={l.locked ? "Déverrouiller" : "Verrouiller"}
                    title={l.locked ? "Verrouillé : rien ne s’y dessine" : "Verrouiller"}
                    aria-pressed={l.locked}
                    onClick={() => patchLayer(l.id, { locked: !l.locked })}
                  >
                    {l.locked ? <Lock size={15} /> : <LockOpen size={15} />}
                  </Button>
                  <Button aria-label="Monter" disabled={i === 0} onClick={() => moveLayer(l.id, 1)}>
                    <ArrowUp size={15} />
                  </Button>
                  <Button
                    aria-label="Descendre"
                    onClick={() => moveLayer(l.id, -1)}
                    disabled={i === mapLayers.length - 1}
                  >
                    <ArrowDown size={15} />
                  </Button>
                  <Button
                    aria-label={`Supprimer le calque ${l.name}`}
                    onClick={() => void deleteLayer(l)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}
              <div className={`map-layer ${layerId === null ? "on" : ""}`}>
                <Button
                  role="radio"
                  aria-checked={layerId === null}
                  className="map-layer-pick"
                  onClick={() => setActiveLayer(null)}
                >
                  <i aria-hidden="true" />
                </Button>
                <span className="map-layer-name">
                  {MAIN_LAYER}
                  <small>Toujours visible, avec les murs et les portes</small>
                </span>
              </div>
            </div>
            <Button
              className="btn"
              disabled={mapLayers.length >= LAYERS_MAX}
              onClick={() => void addLayer()}
            >
              <Plus size={15} /> Nouveau calque
            </Button>
          </Panel>
        )}
        {canEdit && map && panel === "library" && (
          <Panel title="Bibliothèque" onClose={() => setPanel(null)}>
            <ObjectLibrary
              images={library}
              urls={objectUrls}
              chosen={source}
              onPick={chooseSource}
              onUpload={(f) => void uploadObjectImage(f)}
              onRemoveImage={(src) => void removeObjectImage(src)}
            />
          </Panel>
        )}
        {canEdit && map && tool === "shape" && (
          <ShapeBar value={shapeSettings} onChange={shapeOpt} />
        )}
        {canEdit && map && tool === "door" && (
          <div className="map-door-types" role="radiogroup" aria-label="Type de porte">
            {DOOR_TYPES.map((d) => (
              <Button
                key={d.id}
                role="radio"
                aria-checked={doorType === d.id}
                title={d.hint}
                onClick={() => setDoorType(d.id)}
              >
                {d.label}
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
              hint="Murs et portes fermées cachent ce qu’il y a derrière."
              value={map.fog}
              onChange={(fog) => patchMap({ fog })}
            />
            {map.fog && (
              <div className="map-vision">
                <div
                  className="map-seg two"
                  role="radiogroup"
                  aria-label="Ce que voient les joueurs"
                >
                  <Button
                    role="radio"
                    aria-checked={map.vision_mode === "room"}
                    aria-pressed={map.vision_mode === "room"}
                    onClick={() => patchMap({ vision_mode: "room" })}
                  >
                    Toute la pièce
                  </Button>
                  <Button
                    role="radio"
                    aria-checked={map.vision_mode === "sight"}
                    aria-pressed={map.vision_mode === "sight"}
                    onClick={() => patchMap({ vision_mode: "sight" })}
                  >
                    Champ de vue
                  </Button>
                </div>
                {map.vision_mode === "room" ? (
                  <p className="note plain">
                    En entrant, les joueurs voient toute la pièce. Une porte ouverte dévoile la
                    suivante.
                  </p>
                ) : (
                  <>
                    <label className="uni-field" key={`range-${map.id}`}>
                      <span>Portée en {map.cell_unit} (0 = sans limite)</span>
                      <input
                        className="field"
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={map.vision_range}
                        onBlur={(e) => {
                          const vision_range = Math.max(0, Number(e.target.value) || 0);
                          if (vision_range !== map.vision_range) patchMap({ vision_range });
                        }}
                      />
                    </label>
                    <Switch
                      label="Voir dans les angles"
                      hint="Sinon, ce qui se cache derrière un angle reste invisible."
                      value={map.vision_corners}
                      onChange={(vision_corners) => patchMap({ vision_corners })}
                    />
                  </>
                )}
              </div>
            )}
            <Switch
              label="Les joueurs bougent leur pion"
              value={map.players_move}
              onChange={(players_move) => patchMap({ players_move })}
            />
            <h3>Éclairage</h3>
            <Switch
              label="Nuit et lumières"
              hint="Hors des lumières, la carte s’assombrit. Les murs arrêtent la lumière."
              value={lightSettings.on}
              onChange={(on) => saveLight({ ...lightSettings, on })}
            />
            {lightSettings.on && (
              <>
                <label className="uni-field">
                  <span>Obscurité : {Math.round(lightSettings.dark * 100)} %</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={lightSettings.dark}
                    onChange={(e) => saveLight({ ...lightSettings, dark: Number(e.target.value) })}
                  />
                </label>
                <label className="map-color">
                  <input
                    type="color"
                    value={lightSettings.night}
                    onChange={(e) => saveLight({ ...lightSettings, night: e.target.value })}
                  />
                  <span>Couleur de la nuit</span>
                </label>
                <label className="uni-field" key={`party-light-${map.id}`}>
                  <span>Les pions du groupe éclairent à ({map.cell_unit}, 0 = non)</span>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    step={map.cell_value}
                    defaultValue={Math.round(lightSettings.party * map.cell_value * 10) / 10}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0)
                        saveLight({
                          ...lightSettings,
                          party: Math.min(60, v / map.cell_value),
                        });
                    }}
                  />
                </label>
                <p className="note plain">Pose des lumières avec l’outil Objet → Lumière.</p>
              </>
            )}
            <Switch
              label="Brouillard à la main"
              hint="Les joueurs ne voient que les cases que tu révèles avec l’outil Brouillard (F)."
              value={map.manual_fog}
              onChange={(manual_fog) => patchMap({ manual_fog })}
            />
            <h3>Apparence</h3>
            <StyleSection value={mapStyle} onChange={saveStyle} />
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
            <h3>Étages</h3>
            <div className="map-pair" key={`floor-${map.id}-${map.level}`}>
              <label className="uni-field">
                <span>Lieu</span>
                <input
                  className="field"
                  defaultValue={map.place ?? ""}
                  maxLength={40}
                  placeholder="Ex. : la tour"
                  onBlur={(e) => {
                    const place = e.target.value.trim() || null;
                    if (place !== (map.place ?? null)) patchMap({ place });
                  }}
                />
              </label>
              <label className="uni-field">
                <span>Niveau</span>
                <input
                  className="field"
                  type="number"
                  min={-50}
                  max={50}
                  defaultValue={map.level}
                  onBlur={(e) => {
                    const level = Math.round(Number(e.target.value));
                    if (
                      Number.isFinite(level) &&
                      level >= -50 &&
                      level <= 50 &&
                      level !== map.level
                    )
                      patchMap({ level });
                    else e.target.value = String(map.level);
                  }}
                />
              </label>
            </div>
            <p className="note plain">
              Les cartes d’un même lieu se suivent par niveau, avec les flèches en haut. Relie un
              escalier à un autre étage depuis l’outil Objet.
            </p>
            <Button className="btn" onClick={() => void createFloor()}>
              <Plus size={15} /> Nouvel étage
            </Button>
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
            {onMap.some((t) => t.hidden) && (
              <Button className="btn" onClick={revealAll}>
                <Eye size={15} /> Révéler tous les pions cachés
              </Button>
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
