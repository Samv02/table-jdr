import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  blockers,
  cellAt,
  clampToken,
  distance,
  edgeKey,
  edgesBetween,
  eraseTarget,
  fitCamera,
  formatDistance,
  initials,
  inPolygon,
  insideMap,
  nearestCorner,
  nearestEdge,
  removeEdge,
  roomEdges,
  setEdge,
  snapToCell,
  visibility,
  zoomAt,
  type Camera,
  type DoorType,
  type MapEdge,
  type Point,
} from "@/lib/map";
import { neonVar } from "@/lib/profile";
import type { PartyMember } from "@/lib/table-context";

export type MapTool =
  "move" | "wall" | "room" | "door" | "erase" | "enemy" | "ally" | "measure" | "ping";
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
const GUTTER = 22;
const BASE = 16;
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

/**
 * Plateau en SVG avec caméra libre. Les gestes restent ici : pendant un tracé ou un glissé
 * rien ne part vers la base, le parent reçoit le résultat quand le pointeur se relève.
 */
export function MapBoard({
  width,
  height,
  edges,
  tokens,
  party,
  tool,
  doorType,
  editable,
  mine,
  canDrag,
  selected,
  background,
  backgroundOpacity,
  showGrid,
  vision,
  cellValue,
  cellUnit,
  pings,
  focus,
  onEdges,
  onDoor,
  onMove,
  onDragLive,
  onSelect,
  onPlace,
  onPing,
}: {
  width: number;
  height: number;
  edges: MapEdge[];
  tokens: MapToken[];
  party: PartyMember[];
  tool: MapTool;
  doorType: DoorType;
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
  cellValue: number;
  cellUnit: string;
  pings: Ping[];
  focus: { p: Point; n: number } | null;
  onEdges: (next: MapEdge[]) => void;
  onDoor: (key: string) => void;
  onMove: (id: string, p: Point) => void;
  onDragLive: (id: string, p: Point) => void;
  onSelect: (id: string | null) => void;
  onPlace: (p: Point) => void;
  onPing: (p: Point) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera | null>(null);
  const [stroke, setStroke] = useState<MapEdge[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; p: Point } | null>(null);
  const [ruler, setRuler] = useState<{ a: Point; b: Point } | null>(null);
  const [room, setRoom] = useState<{ a: Point; b: Point } | null>(null);
  const moved = useRef(false);
  const corner = useRef<Point | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const space = useRef(false);
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ d: number; c: Point } | null>(null);
  const contentW = width * CELL + GUTTER;
  const contentH = height * CELL + GUTTER;
  const shown = stroke ?? edges;

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

  function cancel() {
    setStroke(null);
    setDrag(null);
    setRoom(null);
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
    if (tool === "enemy" || tool === "ally") return onPlace(clampToken(p, width, height));
    if (tool === "door" && doorType === "trap")
      return onEdges(paint(edges, cellAt(p, width, height)));
    moved.current = false;
    const c = nearestCorner(p, width, height);
    if (tool === "room") return setRoom({ a: c, b: c });
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
    if (ruler) return setRuler({ a: ruler.a, b: clampToken(p, width, height) });
    if (room) return setRoom({ a: room.a, b: nearestCorner(p, width, height) });
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
    if (room) {
      const walls = roomEdges(room.a, room.b);
      setRoom(null);
      if (walls.length) onEdges(walls.reduce(paint, edges));
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
  const polygons = useMemo(() => {
    if (!vision || !eyes) return vision ? [] : null;
    const walls = blockers(edges);
    return eyes.split("|").map((s) => {
      const [x, y] = s.split(":").map(Number);
      return visibility({ x: x as number, y: y as number }, walls, width, height);
    });
  }, [vision, eyes, edges, width, height]);
  const visible =
    vision === "player" && polygons
      ? tokens.filter((t) => t.kind === "party" || polygons.some((p) => inPolygon(at(t), p)))
      : tokens;

  const zoomBy = (factor: number) =>
    setCam((c) => (c ? zoomAt(c, view.w / 2, view.h / 2, factor) : c));
  const lines = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
  const preview = room ? roomEdges(room.a, room.b) : [];
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
      <svg className="map-board" role="img" aria-label="Carte de la table">
        <defs>
          {polygons && (
            <mask id="map-sight">
              <rect x={-CELL} y={-CELL} width={contentW + CELL * 2} height={contentH + CELL * 2} />
              {polygons.map((poly, i) => (
                <polygon key={i} points={polygonPoints(poly)} fill="black" />
              ))}
            </mask>
          )}
        </defs>
        {cam && (
          <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
            <rect className="map-floor" width={width * CELL} height={height * CELL} rx={2} />
            {background && (
              <image
                href={background}
                width={width * CELL}
                height={height * CELL}
                opacity={backgroundOpacity}
                preserveAspectRatio="xMidYMid slice"
              />
            )}
            {showGrid && (
              <g className="map-grid">
                {lines(width).map((x) => (
                  <line key={x} x1={x * CELL} x2={x * CELL} y2={height * CELL} />
                ))}
                {lines(height).map((y) => (
                  <line key={y} y1={y * CELL} y2={y * CELL} x2={width * CELL} />
                ))}
              </g>
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
            {preview.map((e) => (
              <line key={edgeKey(e)} className="map-wall ghost" {...edgeLine(e)} />
            ))}
            {polygons && (
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
