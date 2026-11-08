/**
 * Export d'une carte : en image (PNG, JPG), à imprimer, ou en fichier rechargeable.
 * L'image part du plateau affiché : on le recopie avec ses styles calculés, sans les outils.
 */
import { readEdges, type MapEdge } from "@/lib/map";
import { readObjects, type MapObject } from "@/lib/map-objects";
import { readShapes, type MapShape } from "@/lib/map-shapes";

/** Ce qui ne sert qu'à dessiner : jamais dans l'image. */
const EDITOR_ONLY = [
  ".map-grid.faint",
  ".map-object-handles",
  ".map-ground-hidden",
  ".map-zone",
  ".map-brush",
  ".map-shape-ghost",
  ".map-draft-pt",
  ".map-grad",
  ".map-object.k-light",
  ".map-object.is-ghost",
  ".map-ruler",
  ".map-ping",
  ".map-door-hit",
  ".map-fog",
  ".map-handfog",
];

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "paint-order",
  "mix-blend-mode",
  "clip-rule",
  "display",
  "visibility",
];

export type ImageOptions = {
  /** Pixels par case dans l'image */
  ppc: number;
  type: "image/png" | "image/jpeg";
  tokens: boolean;
  /** Garder la nuit, à son obscurité réelle */
  night: boolean;
  dark: number;
};

/** Taille finale de l'image, en pixels ; bornée pour rester lisible par les téléphones. */
export const IMAGE_MAX_PIXELS = 40_000_000;
export function imageSize(w: number, h: number, cell: number, ppc: number) {
  const scale = Math.min(1, Math.sqrt(IMAGE_MAX_PIXELS / (w * ppc * h * ppc)));
  return {
    width: Math.floor(w * ppc * scale),
    height: Math.floor(h * ppc * scale),
    reduced: scale < 1,
    viewBox: `0 0 ${w * cell} ${h * cell}`,
  };
}

async function toDataUrl(url: string) {
  const blob = await (await fetch(url)).blob();
  return await new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ko(r.error);
    r.readAsDataURL(blob);
  });
}

/** Image de la carte entière, à partir du plateau affiché (`svg` : l'élément `.map-board`). */
export async function mapImage(
  svg: SVGSVGElement,
  w: number,
  h: number,
  cell: number,
  o: ImageOptions,
): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Styles calculés recopiés à la main : une image SVG ne lit pas les feuilles de style
  const from = [svg, ...svg.querySelectorAll("*")];
  const to = [clone, ...clone.querySelectorAll("*")];
  from.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const target = to[i] as SVGElement | undefined;
    if (!target?.style) return;
    for (const p of STYLE_PROPS) target.style.setProperty(p, cs.getPropertyValue(p));
  });
  const drop = [
    ...EDITOR_ONLY,
    ...(o.tokens ? [] : [".map-token"]),
    ...(o.night ? [] : [".map-night"]),
  ];
  for (const el of clone.querySelectorAll(drop.join(","))) el.remove();
  // Chez le MJ la nuit est à moitié : dans l'image, elle reprend son obscurité réelle
  for (const el of clone.querySelectorAll<SVGElement>(".map-night")) {
    el.setAttribute("opacity", String(o.dark));
    el.style.removeProperty("opacity");
  }
  // La caméra est retirée : l'image cadre toute la carte
  clone.querySelector(":scope > g[transform]")?.removeAttribute("transform");
  const size = imageSize(w, h, cell, o.ppc);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", size.viewBox);
  clone.setAttribute("width", String(size.width));
  clone.setAttribute("height", String(size.height));
  // Une image SVG ne charge rien d'extérieur : les images de la carte y sont intégrées
  for (const img of clone.querySelectorAll("image")) {
    const href = img.getAttribute("href");
    if (!href || href.startsWith("data:")) continue;
    try {
      img.setAttribute("href", await toDataUrl(href));
    } catch {
      img.remove();
    }
  }
  const text = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const picture = new Image();
    picture.decoding = "async";
    await new Promise<void>((ok, ko) => {
      picture.onload = () => ok();
      picture.onerror = () => ko(new Error("Image de la carte illisible"));
      picture.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Dessin impossible sur cet appareil");
    if (o.type === "image/jpeg") {
      // Le JPG n'a pas de transparence : fond de la roche
      const rock = svg.querySelector(".map-floor");
      ctx.fillStyle = rock ? getComputedStyle(rock).fill : "#000";
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.drawImage(picture, 0, 0, size.width, size.height);
    return await new Promise<Blob>((ok, ko) =>
      canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Image trop grande"))), o.type, 0.92),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Nom de fichier sans caractères gênants. */
export const fileName = (name: string, ext: string) =>
  `${(
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "carte"
  ).slice(0, 60)}.${ext}`;

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- Fichier de carte

/** Couleurs de pion acceptées par la base */
const TOKEN_COLORS = ["cyan", "pink", "yellow", "red", "green", "violet"];

export const FILE_FORMAT = "table-jdr-carte";
export const FILE_VERSION = 1;

export type MapFile = {
  format: typeof FILE_FORMAT;
  version: number;
  map: {
    name: string;
    width: number;
    height: number;
    place: string | null;
    level: number;
    walls: MapEdge[];
    shapes: MapShape[];
    objects: MapObject[];
    style: Record<string, unknown>;
    light: Record<string, unknown>;
    manual_fog: boolean;
    fog_mask: string;
    cell_value: number;
    cell_unit: string;
    show_grid: boolean;
    fog: boolean;
    vision_mode: "room" | "sight";
    vision_range: number;
    vision_corners: boolean;
  };
  layers: {
    name: string;
    position: number;
    hidden: boolean;
    locked: boolean;
    shapes: MapShape[];
    objects: MapObject[];
  }[];
  /** Ennemis et alliés ; les pions du groupe appartiennent à la table, ils ne voyagent pas */
  tokens: {
    kind: "enemy" | "ally";
    label: string;
    x: number;
    y: number;
    hidden: boolean;
    size: number;
    color: string | null;
  }[];
};

const obj = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown, fallback: string, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
const numIn = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/**
 * Relit un fichier de carte. Tout est revérifié comme une lecture en base :
 * ce qui est illisible est laissé de côté, jamais une erreur au milieu de l'import.
 */
export function readMapFile(text: string): MapFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const root = obj(raw);
  if (root["format"] !== FILE_FORMAT) return null;
  const m = obj(root["map"]);
  const width = Math.round(numIn(m["width"], 4, 100, 24));
  const height = Math.round(numIn(m["height"], 4, 100, 16));
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    map: {
      name: str(m["name"], "Carte importée", 60),
      width,
      height,
      place:
        typeof m["place"] === "string" && m["place"].trim() ? m["place"].trim().slice(0, 40) : null,
      level: Math.round(numIn(m["level"], -50, 50, 0)),
      walls: readEdges(m["walls"]),
      shapes: readShapes(m["shapes"]),
      objects: readObjects(m["objects"]),
      style: obj(m["style"]),
      light: obj(m["light"]),
      manual_fog: bool(m["manual_fog"], false),
      fog_mask:
        typeof m["fog_mask"] === "string" && m["fog_mask"].length <= 1700 ? m["fog_mask"] : "",
      cell_value: numIn(m["cell_value"], 0.1, 1000, 1),
      cell_unit: str(m["cell_unit"], "case", 12),
      show_grid: bool(m["show_grid"], true),
      fog: bool(m["fog"], false),
      vision_mode: m["vision_mode"] === "room" ? "room" : "sight",
      vision_range: numIn(m["vision_range"], 0, 10000, 0),
      vision_corners: bool(m["vision_corners"], false),
    },
    layers: (Array.isArray(root["layers"]) ? root["layers"] : []).slice(0, 20).map((l, i) => {
      const o = obj(l);
      return {
        name: str(o["name"], `Calque ${i + 1}`, 40),
        position: Math.round(numIn(o["position"], -1000, 1000, i)),
        hidden: bool(o["hidden"], false),
        locked: bool(o["locked"], false),
        shapes: readShapes(o["shapes"]),
        objects: readObjects(o["objects"]),
      };
    }),
    tokens: (Array.isArray(root["tokens"]) ? root["tokens"] : []).slice(0, 300).flatMap((t) => {
      const o = obj(t);
      if (o["kind"] !== "enemy" && o["kind"] !== "ally") return [];
      return [
        {
          kind: o["kind"],
          label: str(o["label"], o["kind"] === "enemy" ? "Ennemi" : "Allié", 40),
          x: numIn(o["x"], 0, width, 0),
          y: numIn(o["y"], 0, height, 0),
          hidden: bool(o["hidden"], false),
          size: numIn(o["size"], 0.5, 4, 1),
          color:
            typeof o["color"] === "string" && TOKEN_COLORS.includes(o["color"]) ? o["color"] : null,
        },
      ];
    }),
  };
}
