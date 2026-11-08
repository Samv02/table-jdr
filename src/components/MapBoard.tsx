import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, Maximize, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cellAt,
  clampToken,
  distance,
  edgeKey,
  edgesBetween,
  eraseTarget,
  fitCamera,
  formatDistance,
  initials,
  insideMap,
  nearestCorner,
  nearestEdge,
  removeEdge,
  setEdge,
  snapToCell,
  sees,
  blockers,
  visibility,
  sightFrom,
  cellRuns,
  zoomAt,
  type Camera,
  type DoorType,
  type MapEdge,
  type VisionRule,
  type Point,
} from "@/lib/map";
import {
  SHAPES_MAX,
  cutByDoors,
  draftShape,
  floorOf,
  floorPath,
  floorSegments,
  pathOffset,
  previewPath,
  shapeArea,
  snapPoint,
  type MapShape,
  type ShapeSettings,
} from "@/lib/map-shapes";
import { neonVar } from "@/lib/profile";
import { ObjectView, type ObjectSource } from "@/components/MapObjects";
import {
  OBJECTS_MAX,
  boxOf,
  objectAt,
  resizeTo,
  rotationTo,
  snapObjectCenter,
  stampAt,
  toMap,
  updateObject,
  type MapObject,
  type StampSettings,
} from "@/lib/map-objects";
import { TERRAINS, hatchTile, styleVars, type MapStyle } from "@/lib/map-style";
import { zoneFrom, type Zone } from "@/lib/map-zone";
import {
  hiddenCells,
  isRevealed,
  lightSources,
  paintMask,
  revealRoom,
  type LightSettings,
} from "@/lib/map-light";
import type { PartyMember } from "@/lib/table-context";

export type MapTool =
  | "move"
  | "wall"
  | "shape"
  | "door"
  | "object"
  | "stamp"
  | "zone"
  | "fog"
  | "erase"
  | "enemy"
  | "ally"
  | "measure"
  | "ping";
export type MapToken = {
  id: string;
  kind: string;
  character_id: string | null;
  label: string;
  x: number;
  y: number;
  hidden: boolean;
  size: number;
  color: string | null;
};
export type Ping = { id: number; x: number; y: number; color: string };

const CELL = 40;
/** Les murs d'une pièce visible restent entiers au bord du brouillard */
const WALL_BLEED = 3;
const GUTTER = 22;
const BASE = 16;
/** Carreau du motif de hachures, en pixels (deux cases) */
const HATCH_TILE = CELL * 2;
/** Poignées des objets, en pixels à l'écran */
const HANDLE = 7;
const EDIT_TOOLS: MapTool[] = ["wall", "shape", "door", "erase", "object", "stamp", "zone"];
/** Réglages du pinceau de brouillard */
export type FogBrush = { mode: "brush" | "room"; reveal: boolean; size: number };
const STROKE_TOOLS: MapTool[] = ["wall", "door", "erase"];

function tokenColor(t: MapToken, member?: PartyMember) {
  if (t.color) return `var(--${t.color})`;
  if (t.kind === "enemy") return "var(--red)";
  if (t.kind === "ally") return "var(--green)";
  return neonVar(member?.color);
}

const polygonPoints = (poly: Point[]) => poly.map((p) => `${p.x * CELL},${p.y * CELL}`).join(" ");

const edgeLine = (e: Pick<MapEdge, "x" | "y" | "dir">) => ({
  x1: e.x * CELL,
  y1: e.y * CELL,
  x2: (e.x + (e.dir === "h" ? 1 : 0)) * CELL,
  y2: (e.y + (e.dir === "v" ? 1 : 0)) * CELL,
});

const TRAP = CELL * 0.6;
const trapBox = (e: MapEdge) => ({
  x: (e.x + 0.5) * CELL - TRAP / 2,
  y: (e.y + 0.5) * CELL - TRAP / 2,
  width: TRAP,
  height: TRAP,
});

/** Dessin d'un mur ou d'une porte. Une porte secrète fermée n'est un mur que pour les joueurs. */
export function EdgeMark({ edge: e, gm }: { edge: MapEdge; gm: boolean }) {
  if (e.door === "trap") {
    const box = trapBox(e);
    return (
      <g className={e.open ? "map-trap open" : "map-trap"}>
        <rect {...box} rx={2} />
        {!e.open && (
          <>
            <line x1={box.x} y1={box.y} x2={box.x + TRAP} y2={box.y + TRAP} />
            <line x1={box.x + TRAP} y1={box.y} x2={box.x} y2={box.y + TRAP} />
          </>
        )}
      </g>
    );
  }
  const line = edgeLine(e);
  if (e.kind === "wall") return <line {...line} className="map-wall" />;
  if (e.door === "secret" && !e.open)
    return (
      <>
        <line {...line} className="map-wall" />
        {gm && <line {...line} className="map-door secret" />}
      </>
    );
  if (e.door === "bars")
    return <line {...line} className={e.open ? "map-door open" : "map-door bars"} />;
  if (e.door === "double") {
    const mx = (line.x1 + line.x2) / 2;
    const my = (line.y1 + line.y2) / 2;
    const gapX = e.dir === "h" ? 2 : 0;
    const gapY = e.dir === "v" ? 2 : 0;
    // Ouverte, chaque battant pivote sur son gond, à angle droit de l'arête
    const leafX = e.dir === "v" ? CELL * 0.4 : 0;
    const leafY = e.dir === "h" ? CELL * 0.4 : 0;
    return e.open ? (
      <>
        <line
          className="map-door leaf"
          x1={line.x1}
          y1={line.y1}
          x2={line.x1 + leafX}
          y2={line.y1 + leafY}
        />
        <line
          className="map-door leaf"
          x1={line.x2}
          y1={line.y2}
          x2={line.x2 + leafX}
          y2={line.y2 + leafY}
        />
      </>
    ) : (
      <>
        <line className="map-door double" x1={line.x1} y1={line.y1} x2={mx - gapX} y2={my - gapY} />
        <line className="map-door double" x1={mx + gapX} y1={my + gapY} x2={line.x2} y2={line.y2} />
      </>
    );
  }
  return <line {...line} className={e.open ? "map-door open" : "map-door"} />;
}

/** Eau, lave, végétation ou route : un aplat, un reflet au bord intérieur, un contour. */
function Terrain({ t, d }: { t: string; d: string }) {
  return (
    <g className={`map-terrain ${t}`}>
      <path className="fill" d={d} fillRule="evenodd" />
      {t === "plants" && (
        <path className="leaves" d={d} fillRule="evenodd" fill="url(#map-leaves)" />
      )}
      <path className="band" d={d} clipPath={`url(#map-terrain-${t})`} />
      <path className="edge" d={d} />
    </g>
  );
}

/**
 * Plateau en SVG avec caméra libre. Les gestes restent ici : pendant un tracé ou un glissé
 * rien ne part vers la base, le parent reçoit le résultat quand le pointeur se relève.
 */
export function MapBoard({
  width,
  height,
  edges,
  shapes,
  tokens,
  party,
  tool,
  doorType,
  shapeSettings,
  mapStyle,
  allShapes,
  ghostShapes,
  layerObjects,
  activeLayer,
  locked,
  objects,
  objectUrls,
  selectedObject,
  placing,
  objectSnap,
  stampSource,
  stamp,
  light,
  manualFog,
  fogMask,
  fogBrush,
  zone,
  clip,
  editable,
  mine,
  canDrag,
  selected,
  background,
  backgroundOpacity,
  showGrid,
  vision,
  visionRule,
  cellValue,
  cellUnit,
  pings,
  focus,
  onEdges,
  onShapes,
  onDoor,
  onMove,
  onDragLive,
  onSelect,
  onPlace,
  onPing,
  onObjects,
  onSelectObject,
  onPlaceObject,
  onZone,
  onPaste,
  onFogMask,
}: {
  width: number;
  height: number;
  edges: MapEdge[];
  shapes: MapShape[];
  tokens: MapToken[];
  party: PartyMember[];
  tool: MapTool;
  doorType: DoorType;
  shapeSettings: ShapeSettings;
  mapStyle: MapStyle;
  /** Sols de tous les calques visibles, dans l'ordre ; `shapes` ne contient que le calque actif */
  allShapes: MapShape[];
  /** Sols des calques cachés aux joueurs, montrés au MJ en transparence */
  ghostShapes: MapShape[];
  /** Objets de chaque calque, dans l'ordre ; ghost : calque caché aux joueurs */
  layerObjects: { id: string | null; objects: MapObject[]; ghost: boolean }[];
  activeLayer: string | null;
  /** Calque actif verrouillé : rien ne s'y dessine */
  locked: boolean;
  /** Objets du calque actif, les seuls qu'on peut prendre */
  objects: MapObject[];
  /** Liens signés des images importées, par chemin */
  objectUrls: Record<string, string>;
  selectedObject: string | null;
  /** Outil Objet : un clic dans le vide pose l'objet choisi */
  placing: boolean;
  /** Aimant des objets : 1 = case, 0.5 = demi-case, 0 = libre */
  objectSnap: number;
  stampSource: ObjectSource | null;
  stamp: StampSettings;
  light: LightSettings;
  /** Brouillard à la main : seules les cases révélées se voient chez les joueurs */
  manualFog: boolean;
  fogMask: Uint8Array;
  fogBrush: FogBrush;
  zone: Zone | null;
  /** Taille de la zone copiée : un clic la colle */
  clip: { w: number; h: number } | null;
  editable: boolean;
  /** Personnages de ce compte : leur pion est signalé */
  mine: Set<string>;
  canDrag: (t: MapToken) => boolean;
  selected: string | null;
  background: string | null;
  backgroundOpacity: number;
  showGrid: boolean;
  /** player : le brouillard cache vraiment ; preview : le MJ voit ce que voit le groupe */
  vision: "player" | "preview" | null;
  visionRule: VisionRule;
  cellValue: number;
  cellUnit: string;
  pings: Ping[];
  focus: { p: Point; n: number } | null;
  onEdges: (next: MapEdge[]) => void;
  onShapes: (next: MapShape[]) => void;
  onDoor: (key: string) => void;
  onMove: (id: string, p: Point) => void;
  onDragLive: (id: string, p: Point) => void;
  onSelect: (id: string | null) => void;
  onPlace: (p: Point) => void;
  onPing: (p: Point) => void;
  onObjects: (next: MapObject[]) => void;
  onSelectObject: (id: string | null) => void;
  onPlaceObject: (p: Point) => void;
  onZone: (z: Zone | null) => void;
  onPaste: (p: Point) => void;
  onFogMask: (next: Uint8Array) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera | null>(null);
  const [stroke, setStroke] = useState<MapEdge[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; p: Point } | null>(null);
  const [ruler, setRuler] = useState<{ a: Point; b: Point } | null>(null);
  /** Sol en cours : deux points pour un rectangle ou un cercle, les points posés sinon */
  const [draft, setDraft] = useState<Point[] | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const shaping = useRef(false);
  /** Objet en cours de déplacement, d'agrandissement ou de rotation */
  const [objDraft, setObjDraft] = useState<MapObject | null>(null);
  const objGesture = useRef<{
    mode: "move" | "resize" | "rotate";
    start: MapObject;
    grab: Point;
  } | null>(null);
  /** Copies du tampon pas encore enregistrées */
  const [stamped, setStamped] = useState<MapObject[] | null>(null);
  const lastStamp = useRef<Point | null>(null);
  const [zoneDrag, setZoneDrag] = useState<{ a: Point; b: Point } | null>(null);
  /** Brouillard en cours de pinceau, pas encore enregistré */
  const [maskDraft, setMaskDraft] = useState<Uint8Array | null>(null);
  const lastBrush = useRef<Point | null>(null);
  const moved = useRef(false);
  const corner = useRef<Point | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const space = useRef(false);
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ d: number; c: Point } | null>(null);
  const contentW = width * CELL + GUTTER;
  const contentH = height * CELL + GUTTER;
  const shown = stroke ?? edges;
  const floor = useMemo(() => floorOf(allShapes, width, height), [allShapes, width, height]);
  const ghostGround = useMemo(
    () => (ghostShapes.length ? floorPath(floorOf(ghostShapes, width, height), CELL) : ""),
    [ghostShapes, width, height],
  );
  const ground = useMemo(() => floorPath(floor, CELL), [floor]);
  // Eau, lave, végétation, route : chacune sa couche, sans murs
  const terrains = useMemo(
    () =>
      TERRAINS.map((t) => ({ t, d: floorPath(floorOf(allShapes, width, height, t), CELL) })).filter(
        (x) => x.d,
      ),
    [allShapes, width, height],
  );
  const hatchLines = useMemo(() => hatchTile(HATCH_TILE), []);
  const walls = useMemo(() => cutByDoors(floorSegments(floor), edges), [floor, edges]);
  const kind = shapeSettings.kind;
  const clicking = kind === "path" || kind === "poly";
  const snapAt = (p: Point) =>
    snapPoint(
      p,
      shapeSettings.snap,
      width,
      height,
      kind === "path" ? pathOffset(shapeSettings.width, shapeSettings.snap) : 0,
    );

  // Changer d'outil ou de forme abandonne le tracé en cours (rien n'était enregistré)
  useEffect(() => {
    setDraft(null);
    setHover(null);
    shaping.current = false;
  }, [tool, kind]);

  function commitShape(pts: Point[]) {
    setDraft(null);
    setHover(null);
    shaping.current = false;
    const shape = draftShape(shapeSettings, pts);
    if (shapes.length >= SHAPES_MAX || shapeArea(shape) < 0.01) return;
    onShapes([...shapes, shape]);
  }
  function finishDraft() {
    if (!draft || !clicking) return;
    if (draft.length >= (kind === "poly" ? 3 : 1)) commitShape(draft);
    else setDraft(null);
  }
  const finishRef = useRef(finishDraft);
  finishRef.current = finishDraft;
  useEffect(() => {
    if (!draft || !clicking) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === "Enter") finishRef.current();
      if (e.key === "Backspace") {
        e.preventDefault();
        setDraft((d) => (d && d.length > 1 ? d.slice(0, -1) : null));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [draft, clicking]);

  function fit() {
    if (!view.w) return;
    const c = fitCamera(contentW, contentH, view.w, view.h);
    setCam({ ...c, x: c.x + GUTTER * c.k, y: c.y + GUTTER * c.k });
  }

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Premier cadrage, puis nouveau cadrage si la carte change de taille
  useEffect(fit, [view.w, view.h, contentW, contentH]);

  useEffect(() => {
    if (!focus || !view.w) return;
    setCam((c) => {
      const k = c?.k ?? 1;
      return {
        k,
        x: view.w / 2 - focus.p.x * CELL * k,
        y: view.h / 2 - focus.p.y * CELL * k,
      };
    });
  }, [focus, view.w, view.h]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setCam((c) => (c ? zoomAt(c, e.clientX - r.left, e.clientY - r.top, factor) : c));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code !== "Space" || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      space.current = e.type === "keydown";
      if (e.type === "keydown") e.preventDefault();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, []);

  /** Position du pointeur, en cases. */
  function cells(e: { clientX: number; clientY: number }): Point {
    const r = box.current?.getBoundingClientRect();
    if (!r || !cam) return { x: 0, y: 0 };
    return {
      x: (e.clientX - r.left - cam.x) / cam.k / CELL,
      y: (e.clientY - r.top - cam.y) / cam.k / CELL,
    };
  }

  const paint = (list: MapEdge[], key: Pick<MapEdge, "x" | "y" | "dir">) => {
    if (!insideMap(key, width, height)) return list;
    if (tool === "erase") return removeEdge(list, edgeKey(key));
    if (tool !== "door") return setEdge(list, { ...key, kind: "wall" });
    return setEdge(list, {
      ...key,
      kind: "door",
      ...(doorType === "simple" ? {} : { door: doorType }),
    });
  };

  const snapCenter = (c: Point, o: MapObject) => snapObjectCenter(c, o, objectSnap, width, height);
  function startObject(mode: "move" | "resize" | "rotate", o: MapObject, p: Point) {
    objGesture.current = { mode, start: o, grab: { x: p.x - o.x, y: p.y - o.y } };
    moved.current = false;
    setObjDraft(o);
  }
  function addStamp(p: Point, done: MapObject[]) {
    if (!stampSource || objects.length + done.length >= OBJECTS_MAX) return done;
    const base =
      stampSource.k === "symbol"
        ? { k: "symbol" as const, sym: stampSource.sym }
        : { k: "image" as const, src: stampSource.src };
    lastStamp.current = p;
    return [...done, stampAt(base, p, stamp, [...objects, ...done])];
  }

  function cancel() {
    setStroke(null);
    objGesture.current = null;
    setObjDraft(null);
    setStamped(null);
    setZoneDrag(null);
    setMaskDraft(null);
    setDrag(null);
    if (!clicking) setDraft(null);
    shaping.current = false;
    corner.current = null;
    pan.current = null;
  }

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as Element;
    if (target.closest("button, a, input, select, label")) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    box.current?.setPointerCapture(e.pointerId);
    if (touches.current.size === 2) {
      cancel();
      const [a, b] = [...touches.current.values()] as [Point, Point];
      pinch.current = { d: distance(a, b), c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    const p = cells(e);
    if (e.button === 1 || space.current) {
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.altKey || tool === "ping") return onPing(clampToken(p, width, height));
    if (tool === "measure") {
      const a = clampToken(p, width, height);
      setRuler({ a, b: a });
      return;
    }
    if (tool === "move") {
      if (editable) onSelect(null);
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!editable) return;
    // Calque verrouillé : les outils de dessin ne font que déplacer la vue
    if (locked && EDIT_TOOLS.includes(tool)) {
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (tool === "object") {
      const reach = (HANDLE * 1.8) / CELL / (cam?.k ?? 1);
      const sel = objects.find((o) => o.id === selectedObject);
      if (sel) {
        const b = boxOf(sel);
        if (distance(p, toMap(sel, b.w / 2, b.h / 2)) < reach) return startObject("resize", sel, p);
        if (distance(p, toMap(sel, 0, -b.h / 2 - 0.6)) < reach)
          return startObject("rotate", sel, p);
      }
      const hit = objectAt(objects, p);
      if (hit) {
        onSelectObject(hit.id);
        return startObject("move", hit, p);
      }
      if (placing) return onPlaceObject(clampToken(p, width, height));
      onSelectObject(null);
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (tool === "stamp") {
      if (stampSource) setStamped(addStamp(clampToken(p, width, height), []));
      return;
    }
    if (tool === "fog") {
      const q = clampToken(p, width, height);
      if (fogBrush.mode === "room")
        return onFogMask(
          revealRoom(fogMask, q, edges, walls.segments, width, height, fogBrush.reveal),
        );
      lastBrush.current = q;
      return setMaskDraft(paintMask(fogMask, q, fogBrush.size / 2, fogBrush.reveal, width, height));
    }
    if (tool === "zone") {
      moved.current = false;
      return setZoneDrag({ a: p, b: p });
    }
    if (tool === "enemy" || tool === "ally") return onPlace(clampToken(p, width, height));
    if (tool === "door" && doorType === "trap")
      return onEdges(paint(edges, cellAt(p, width, height)));
    if (tool === "shape") {
      const q = snapAt(p);
      if (!clicking) {
        shaping.current = true;
        return setDraft([q, q]);
      }
      if (!draft) return setDraft([q]);
      // Revenir au premier coin ferme la forme ; toucher deux fois le même point termine
      if (kind === "poly" && draft.length >= 3 && distance(q, draft[0]!) < 0.3)
        return commitShape(draft);
      if (distance(q, draft.at(-1)!) < 0.05) return finishDraft();
      if (draft.length < 200) setDraft([...draft, q]);
      return;
    }
    moved.current = false;
    const c = nearestCorner(p, width, height);
    corner.current = c;
    setStroke(tool === "erase" ? paint(edges, eraseTarget(edges, p, width, height)) : edges);
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (touches.current.has(e.pointerId))
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()] as [Point, Point];
      const d = distance(a, b);
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = box.current?.getBoundingClientRect();
      const last = pinch.current;
      pinch.current = { d, c };
      setCam((cur) => {
        if (!cur || !r) return cur;
        const z = zoomAt(cur, c.x - r.left, c.y - r.top, d / (last.d || 1));
        return { ...z, x: z.x + c.x - last.c.x, y: z.y + c.y - last.c.y };
      });
      return;
    }
    if (pan.current) {
      const { x, y } = pan.current;
      pan.current = { x: e.clientX, y: e.clientY };
      setCam((c) => (c ? { ...c, x: c.x + e.clientX - x, y: c.y + e.clientY - y } : c));
      return;
    }
    if (drag) {
      moved.current = true;
      const raw = clampToken(cells(e), width, height);
      const p = e.shiftKey ? snapToCell(raw, width, height) : raw;
      setDrag({ id: drag.id, p });
      onDragLive(drag.id, p);
      return;
    }
    const p = cells(e);
    const g = objGesture.current;
    if (g) {
      moved.current = true;
      if (g.mode === "move")
        setObjDraft({
          ...g.start,
          ...snapCenter({ x: p.x - g.grab.x, y: p.y - g.grab.y }, g.start),
        });
      else if (g.mode === "resize")
        setObjDraft({ ...g.start, ...resizeTo(g.start, p, e.shiftKey) });
      else setObjDraft({ ...g.start, r: rotationTo(g.start, p, e.shiftKey) });
      return;
    }
    if (stamped) {
      const q = clampToken(p, width, height);
      if (!lastStamp.current || distance(q, lastStamp.current) >= stamp.spacing)
        setStamped(addStamp(q, stamped));
      return;
    }
    if (zoneDrag) return setZoneDrag({ a: zoneDrag.a, b: p });
    if (tool === "fog" && editable) {
      const q = clampToken(p, width, height);
      setHover(q);
      const from = lastBrush.current;
      if (!maskDraft || !from) return;
      // Pas réguliers entre deux positions : un geste rapide ne laisse pas de trous
      const n = Math.max(1, Math.ceil(distance(from, q) / 0.4));
      setMaskDraft((m) => {
        let next = m ?? fogMask;
        for (let i = 1; i <= n; i++)
          next = paintMask(
            next,
            { x: from.x + ((q.x - from.x) * i) / n, y: from.y + ((q.y - from.y) * i) / n },
            fogBrush.size / 2,
            fogBrush.reveal,
            width,
            height,
          );
        return next;
      });
      lastBrush.current = q;
      return;
    }
    if (tool === "zone" && clip) return setHover(p);
    if (ruler) return setRuler({ a: ruler.a, b: clampToken(p, width, height) });
    if (tool === "shape" && editable) {
      if (shaping.current && draft) return setDraft([draft[0]!, snapAt(p)]);
      if (clicking) setHover(snapAt(p));
      return;
    }
    if (!stroke || !corner.current) return;
    if (tool === "erase")
      return setStroke((s) => {
        const list = s ?? edges;
        return paint(list, eraseTarget(list, p, width, height));
      });
    // Les murs suivent la grille de coin en coin : un tracé ne déborde jamais d'une case
    const next = nearestCorner(p, width, height);
    if (next.x === corner.current.x && next.y === corner.current.y) return;
    const between = edgesBetween(corner.current, next);
    corner.current = next;
    moved.current = true;
    setStroke((s) => between.reduce(paint, s ?? edges));
  }

  function up(e: ReactPointerEvent<HTMLDivElement>) {
    touches.current.delete(e.pointerId);
    if (pinch.current) {
      if (touches.current.size < 2) pinch.current = null;
      return;
    }
    pan.current = null;
    if (ruler) return setRuler(null);
    if (drag) {
      if (moved.current) onMove(drag.id, drag.p);
      setDrag(null);
      return;
    }
    if (shaping.current && draft) return commitShape(draft);
    if (objGesture.current) {
      const d = objDraft;
      objGesture.current = null;
      setObjDraft(null);
      if (moved.current && d)
        onObjects(updateObject(objects, d.id, { x: d.x, y: d.y, w: d.w, h: d.h, r: d.r }));
      return;
    }
    if (stamped) {
      const done = stamped;
      setStamped(null);
      lastStamp.current = null;
      if (done.length) onObjects([...objects, ...done].slice(0, OBJECTS_MAX));
      return;
    }
    if (maskDraft) {
      const done = maskDraft;
      setMaskDraft(null);
      lastBrush.current = null;
      onFogMask(done);
      return;
    }
    if (zoneDrag) {
      const dragged = distance(zoneDrag.a, zoneDrag.b) > 0.3;
      const z = zoneFrom(zoneDrag.a, zoneDrag.b, width, height);
      setZoneDrag(null);
      if (dragged) onZone(z);
      else if (clip) onPaste(cells(e));
      else onZone(null);
      return;
    }
    if (!stroke) return;
    // Un simple clic pose l'élément sur l'arête visée
    const final =
      moved.current || tool === "erase"
        ? stroke
        : paint(stroke, nearestEdge(cells(e), width, height));
    setStroke(null);
    corner.current = null;
    if (final !== edges) onEdges(final);
  }

  function grab(e: ReactPointerEvent<SVGGElement>, t: MapToken) {
    if (tool !== "move" || e.altKey || space.current) return;
    if (editable) onSelect(t.id);
    if (!canDrag(t)) return;
    e.stopPropagation();
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    box.current?.setPointerCapture(e.pointerId);
    moved.current = false;
    setDrag({ id: t.id, p: { x: t.x, y: t.y } });
  }

  const at = (t: MapToken) => (drag?.id === t.id ? drag.p : clampToken(t, width, height));

  // Vision du groupe : recalculée pendant un glissé, pour voir la pièce se dévoiler
  const eyes = tokens
    .filter((t) => t.kind === "party")
    .map(at)
    .map((p) => `${p.x}:${p.y}`)
    .join("|");
  const { mode, range, corners } = visionRule;
  const sights = useMemo(() => {
    if (!vision || !eyes) return vision ? [] : null;
    return eyes.split("|").map((s) => {
      const [x, y] = s.split(":").map(Number);
      const origin = { x: x as number, y: y as number };
      return sightFrom(origin, edges, { mode, range, corners }, width, height, walls.segments);
    });
  }, [vision, eyes, edges, width, height, mode, range, corners, walls]);
  const shownMask = maskDraft ?? fogMask;
  const fogHidden = useMemo(
    () => (manualFog ? hiddenCells(shownMask, width, height) : null),
    [manualFog, shownMask, width, height],
  );
  const inFog = (p: Point) => manualFog && !isRevealed(shownMask, Math.floor(p.x), Math.floor(p.y));
  const visible = editable
    ? tokens
    : tokens.filter(
        (t) =>
          t.kind === "party" ||
          ((!sights || vision !== "player" || sights.some((s) => sees(s, at(t), width, height))) &&
            !inFog(at(t))),
      );

  // Éclairage : chaque lumière arrêtée par les murs, comme la vue
  const viewBlockers = useMemo(() => [...blockers(edges), ...walls.segments], [edges, walls]);
  const litObjects = useMemo(
    () => layerObjects.filter((l) => !l.ghost).flatMap((l) => l.objects),
    [layerObjects],
  );
  const lights = useMemo(() => {
    if (!light.on) return [];
    const carriers = eyes
      ? eyes.split("|").map((e) => {
          const [x, y] = e.split(":").map(Number);
          return { x: x as number, y: y as number };
        })
      : [];
    return lightSources(litObjects, carriers, light).map((l) => ({
      ...l,
      poly: visibility(l, viewBlockers, width, height),
    }));
  }, [light, litObjects, eyes, viewBlockers, width, height]);

  const zoomBy = (factor: number) =>
    setCam((c) => (c ? zoomAt(c, view.w / 2, view.h / 2, factor) : c));
  const lines = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
  const ghostPts = draft && clicking && hover ? [...draft, hover] : draft;
  const ghost = ghostPts ? previewPath(draftShape(shapeSettings, ghostPts), CELL) : "";
  const gridLines = (
    <>
      {lines(width).map((x) => (
        <line key={`x${x}`} x1={x * CELL} x2={x * CELL} y2={height * CELL} />
      ))}
      {lines(height).map((y) => (
        <line key={`y${y}`} y1={y * CELL} y2={y * CELL} x2={width * CELL} />
      ))}
    </>
  );
  const shownObjects = objDraft
    ? objects.map((o) => (o.id === objDraft.id ? objDraft : o))
    : objects;
  const activeObjects = stamped ? [...shownObjects, ...stamped] : shownObjects;
  // Chaque calque dans son ordre ; seul le calque actif suit les gestes en cours
  const allObjects = layerObjects.flatMap((l) =>
    l.id === activeLayer
      ? activeObjects.map((o) => ({ o, ghost: l.ghost }))
      : l.objects.map((o) => ({ o, ghost: l.ghost })),
  );
  const handle = HANDLE / (cam?.k ?? 1);
  const showHandles = editable && tool === "object";
  const drawObject = ({ o, ghost }: { o: MapObject; ghost: boolean }) =>
    // Une lumière se voit à son effet ; son petit soleil n'est montré qu'au MJ
    o.k === "light" && !editable ? null : (
      <ObjectView
        key={o.id}
        o={ghost ? { ...o, op: (o.op ?? 1) * 0.4 } : o}
        ghost={ghost}
        cell={CELL}
        url={o.src ? objectUrls[o.src] : undefined}
        selected={showHandles && o.id === selectedObject}
        handle={handle}
      />
    );
  const zoneShown =
    tool === "zone" && editable
      ? zoneDrag
        ? zoneFrom(zoneDrag.a, zoneDrag.b, width, height)
        : zone
      : null;
  const painting = tool !== "move" && tool !== "measure" && tool !== "ping" && editable;

  return (
    <div
      ref={box}
      className={`map-stage-view tool-${tool} ${painting ? "painting" : ""} ${pan.current ? "panning" : ""}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={(e) => {
        touches.current.delete(e.pointerId);
        pinch.current = null;
        cancel();
      }}
    >
      <svg
        className="map-board"
        role="img"
        aria-label="Carte de la table"
        style={styleVars(mapStyle) as CSSProperties}
      >
        <defs>
          {ground && mapStyle.hatch && (
            <>
              <pattern
                id="map-hatch"
                className="map-hatch-tile"
                patternUnits="userSpaceOnUse"
                width={HATCH_TILE}
                height={HATCH_TILE}
              >
                {hatchLines.map((l, i) => (
                  <line key={i} {...l} />
                ))}
              </pattern>
              <mask
                id="map-hatch-mask"
                maskUnits="userSpaceOnUse"
                x={-CELL}
                y={-CELL}
                width={contentW + CELL * 2}
                height={contentH + CELL * 2}
              >
                <path
                  d={ground}
                  fill="none"
                  stroke="white"
                  strokeWidth={mapStyle.hatchSize * CELL * 2}
                  strokeLinejoin="round"
                />
                <path d={ground} fill="black" fillRule="evenodd" />
              </mask>
            </>
          )}
          {terrains.some((x) => x.t === "plants") && (
            <pattern
              id="map-leaves"
              className="map-leaves-tile"
              patternUnits="userSpaceOnUse"
              width={CELL}
              height={CELL}
            >
              <circle cx={8} cy={9} r={6} />
              <circle cx={27} cy={14} r={8} />
              <circle cx={14} cy={30} r={7} />
              <circle cx={33} cy={34} r={5} />
            </pattern>
          )}
          {terrains.map(({ t, d }) => (
            <clipPath key={t} id={`map-terrain-${t}`}>
              <path d={d} clipRule="evenodd" />
            </clipPath>
          ))}
          {ground && (
            <clipPath id="map-ground-clip">
              <path d={ground} clipRule="evenodd" />
            </clipPath>
          )}
          {sights?.map(
            (s, i) =>
              s.radius > 0 && (
                <clipPath key={i} id={`map-reach-${i}`}>
                  <circle cx={s.origin.x * CELL} cy={s.origin.y * CELL} r={s.radius * CELL} />
                </clipPath>
              ),
          )}
          {lights.map((l, i) => (
            <g key={`l${i}`}>
              <clipPath id={`map-lc-${i}`}>
                <polygon points={polygonPoints(l.poly)} />
              </clipPath>
              <radialGradient id={`map-lg-${i}`}>
                <stop offset={0} stopColor="black" stopOpacity={l.power} />
                <stop offset={l.bright} stopColor="black" stopOpacity={l.power} />
                <stop offset={1} stopColor="black" stopOpacity={0} />
              </radialGradient>
              {l.color && (
                <radialGradient id={`map-lt-${i}`}>
                  <stop offset={0} stopColor={l.color} stopOpacity={0.45 * l.power} />
                  <stop offset={1} stopColor={l.color} stopOpacity={0} />
                </radialGradient>
              )}
            </g>
          ))}
          {light.on && (
            <mask
              id="map-dark"
              maskUnits="userSpaceOnUse"
              x={-CELL}
              y={-CELL}
              width={contentW + CELL * 2}
              height={contentH + CELL * 2}
            >
              <rect
                x={-CELL}
                y={-CELL}
                width={contentW + CELL * 2}
                height={contentH + CELL * 2}
                fill="white"
              />
              {lights.map((l, i) => (
                <g key={i} clipPath={`url(#map-lc-${i})`}>
                  <circle
                    cx={l.x * CELL}
                    cy={l.y * CELL}
                    r={l.rad * CELL}
                    fill={`url(#map-lg-${i})`}
                  />
                </g>
              ))}
            </mask>
          )}
          {sights && (
            <mask id="map-sight">
              <rect x={-CELL} y={-CELL} width={contentW + CELL * 2} height={contentH + CELL * 2} />
              {sights.map((s, i) => (
                <g key={i} clipPath={s.radius > 0 ? `url(#map-reach-${i})` : undefined}>
                  {s.polygon && <polygon points={polygonPoints(s.polygon)} fill="black" />}
                  {s.cells &&
                    cellRuns(s.cells).map((r) => (
                      <rect
                        key={`${r.x}:${r.y}`}
                        x={r.x * CELL - WALL_BLEED}
                        y={r.y * CELL - WALL_BLEED}
                        width={r.w * CELL + WALL_BLEED * 2}
                        height={CELL + WALL_BLEED * 2}
                        fill="black"
                      />
                    ))}
                </g>
              ))}
            </mask>
          )}
        </defs>
        {cam && (
          <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
            <rect
              className={`map-floor ${ground ? "rock" : ""}`}
              width={width * CELL}
              height={height * CELL}
              rx={2}
            />
            {background && (
              <image
                href={background}
                width={width * CELL}
                height={height * CELL}
                opacity={backgroundOpacity}
                preserveAspectRatio="xMidYMid slice"
              />
            )}
            {ground && mapStyle.hatch && (
              <rect
                className="map-hatch"
                width={width * CELL}
                height={height * CELL}
                fill="url(#map-hatch)"
                mask="url(#map-hatch-mask)"
              />
            )}
            {terrains
              .filter((x) => x.t === "road")
              .map(({ t, d }) => (
                <Terrain key={t} t={t} d={d} />
              ))}
            {ground && mapStyle.shadow && (
              <path
                className="map-shadow"
                d={ground}
                fillRule="evenodd"
                transform="translate(5 6)"
              />
            )}
            {ground && (
              <path
                className={`map-ground ${background ? "over-image" : ""}`}
                d={ground}
                fillRule="evenodd"
              />
            )}
            {terrains
              .filter((x) => x.t !== "road")
              .map(({ t, d }) => (
                <Terrain key={t} t={t} d={d} />
              ))}
            {showGrid && (!ground || mapStyle.gridOutside) && (
              <g className="map-grid">{gridLines}</g>
            )}
            {/* Sols dessinés : la grille dans les salles, et dehors pour le MJ qui trace */}
            {showGrid && ground && !mapStyle.gridOutside && editable && (
              <g className="map-grid faint">{gridLines}</g>
            )}
            {showGrid && ground && !mapStyle.gridOutside && (
              <g className="map-grid" clipPath="url(#map-ground-clip)">
                {gridLines}
              </g>
            )}
            {allObjects.filter(({ o }) => o.k !== "text").map(drawObject)}
            {ground && <path className="map-ground-wall" d={ground} />}
            {ghostGround && (
              <path className="map-ground-hidden" d={ghostGround} fillRule="evenodd" />
            )}
            {lines(width - 1).map((x) => (
              <text key={x} className="map-grad" x={x * CELL + CELL / 2} y={-7}>
                {x + 1}
              </text>
            ))}
            {lines(height - 1).map((y) => (
              <text key={y} className="map-grad" x={-11} y={y * CELL + CELL / 2 + 4}>
                {y + 1}
              </text>
            ))}
            {shown.map((e) => {
              const key = edgeKey(e);
              const hit = {
                className: "map-door-hit",
                "aria-label": e.open ? "Fermer la porte" : "Ouvrir la porte",
                onPointerDown: (ev: ReactPointerEvent) => ev.stopPropagation(),
                onClick: () => onDoor(key),
              };
              return (
                <g key={key}>
                  {walls.onWall.has(key) &&
                    e.door !== "trap" &&
                    (e.door !== "secret" || e.open) && (
                      <line className="map-door-gap" {...edgeLine(e)} />
                    )}
                  <EdgeMark edge={e} gm={editable} />
                  {e.kind === "door" &&
                    editable &&
                    tool === "move" &&
                    (e.door === "trap" ? (
                      <rect {...trapBox(e)} {...hit} />
                    ) : (
                      <line {...edgeLine(e)} {...hit} />
                    ))}
                </g>
              );
            })}
            {allObjects.filter(({ o }) => o.k === "text").map(drawObject)}
            {zoneShown && (
              <rect
                className="map-zone"
                x={zoneShown.x0 * CELL}
                y={zoneShown.y0 * CELL}
                width={(zoneShown.x1 - zoneShown.x0) * CELL}
                height={(zoneShown.y1 - zoneShown.y0) * CELL}
              />
            )}
            {tool === "zone" && editable && clip && hover && !zoneDrag && (
              <rect
                className="map-zone paste"
                x={Math.floor(hover.x) * CELL}
                y={Math.floor(hover.y) * CELL}
                width={clip.w * CELL}
                height={clip.h * CELL}
              />
            )}
            {ghost && (
              <path className={`map-shape-ghost ${shapeSettings.erase ? "erase" : ""}`} d={ghost} />
            )}
            {draft &&
              clicking &&
              draft.map((p, i) => (
                <circle
                  key={i}
                  className={`map-draft-pt ${i === 0 && kind === "poly" ? "first" : ""}`}
                  cx={p.x * CELL}
                  cy={p.y * CELL}
                  r={i === 0 && kind === "poly" ? 7 : 4}
                />
              ))}
            {lights.map(
              (l, i) =>
                l.color && (
                  <g key={i} clipPath={`url(#map-lc-${i})`} className="map-light-tint">
                    <circle
                      cx={l.x * CELL}
                      cy={l.y * CELL}
                      r={l.rad * CELL}
                      fill={`url(#map-lt-${i})`}
                    />
                  </g>
                ),
            )}
            {light.on && (
              <rect
                className="map-night"
                width={width * CELL}
                height={height * CELL}
                mask="url(#map-dark)"
                fill={light.night}
                // Le MJ garde la carte lisible : il voit la nuit à moitié
                opacity={editable ? light.dark * 0.55 : light.dark}
              />
            )}
            {fogHidden && fogHidden.size > 0 && (
              <g className={`map-handfog ${editable ? "preview" : ""}`}>
                {cellRuns(fogHidden).map((r) => (
                  <rect
                    key={`${r.x}:${r.y}`}
                    x={r.x * CELL - 0.5}
                    y={r.y * CELL - 0.5}
                    width={r.w * CELL + 1}
                    height={CELL + 1}
                  />
                ))}
              </g>
            )}
            {tool === "fog" && editable && hover && fogBrush.mode === "brush" && (
              <circle
                className={`map-brush ${fogBrush.reveal ? "" : "hide"}`}
                cx={hover.x * CELL}
                cy={hover.y * CELL}
                r={(fogBrush.size / 2) * CELL}
              />
            )}
            {sights && (
              <rect
                className={`map-fog ${vision}`}
                x={-GUTTER}
                y={-GUTTER}
                width={contentW}
                height={contentH}
                mask="url(#map-sight)"
              />
            )}
            {visible.map((t) => {
              const p = at(t);
              const member = party.find((m) => m.character_id === t.character_id);
              const clip = `map-clip-${t.id}`;
              const r = BASE * t.size;
              return (
                <g
                  key={t.id}
                  className={[
                    "map-token",
                    selected === t.id ? "on" : "",
                    t.hidden ? "ghost" : "",
                    drag?.id === t.id ? "dragging" : "",
                    canDrag(t) && tool === "move" ? "movable" : "",
                    t.character_id && mine.has(t.character_id) ? "me" : "",
                  ].join(" ")}
                  style={{
                    ["--t" as string]: tokenColor(t, member),
                    transform: `translate(${p.x * CELL}px, ${p.y * CELL}px)`,
                  }}
                  onPointerDown={(e) => grab(e, t)}
                >
                  <circle r={r} />
                  {member?.avatar ? (
                    <>
                      <clipPath id={clip}>
                        <circle r={r - 2} />
                      </clipPath>
                      <image
                        href={member.avatar}
                        x={2 - r}
                        y={2 - r}
                        width={(r - 2) * 2}
                        height={(r - 2) * 2}
                        clipPath={`url(#${clip})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </>
                  ) : (
                    <text y={4}>{initials(t.label)}</text>
                  )}
                  <text className="map-token-name" y={r + 12}>
                    {t.label}
                  </text>
                </g>
              );
            })}
            {ruler && (
              <g className="map-ruler">
                <line
                  x1={ruler.a.x * CELL}
                  y1={ruler.a.y * CELL}
                  x2={ruler.b.x * CELL}
                  y2={ruler.b.y * CELL}
                />
                <circle cx={ruler.a.x * CELL} cy={ruler.a.y * CELL} r={4} />
                <circle cx={ruler.b.x * CELL} cy={ruler.b.y * CELL} r={4} />
                <text x={ruler.b.x * CELL + 10} y={ruler.b.y * CELL - 10}>
                  {formatDistance(distance(ruler.a, ruler.b), cellValue, cellUnit)}
                </text>
              </g>
            )}
            {pings.map((p) => (
              <g
                key={p.id}
                className="map-ping"
                style={{ ["--t" as string]: p.color }}
                transform={`translate(${p.x * CELL} ${p.y * CELL})`}
              >
                <circle r={8} />
                <circle r={8} />
              </g>
            ))}
          </g>
        )}
      </svg>
      {draft && clicking && (
        <div className="map-draft" role="group" aria-label="Tracé en cours">
          <Button className="btn" onClick={() => setDraft(null)}>
            <X size={15} aria-hidden="true" /> Annuler
          </Button>
          <Button
            className="btn y"
            disabled={draft.length < (kind === "poly" ? 3 : 1)}
            onClick={finishDraft}
          >
            <Check size={15} aria-hidden="true" /> Terminer
          </Button>
        </div>
      )}
      <div className="map-zoom">
        <Button aria-label="Zoomer" title="Zoomer" onClick={() => zoomBy(1.3)}>
          <Plus size={16} />
        </Button>
        <span>{cam ? Math.round(cam.k * 100) : 100} %</span>
        <Button aria-label="Dézoomer" title="Dézoomer" onClick={() => zoomBy(1 / 1.3)}>
          <Minus size={16} />
        </Button>
        <Button aria-label="Tout voir" title="Tout voir" onClick={fit}>
          <Maximize size={15} />
        </Button>
      </div>
    </div>
  );
}
