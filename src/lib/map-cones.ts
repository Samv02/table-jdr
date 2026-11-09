/**
 * Champs de vision : le cône d'une caméra posée sur la carte ou d'un pion (ennemi, allié).
 * Un cône part d'un point, regarde dans une direction (0 = vers le haut, sens des aiguilles
 * d'une montre), s'ouvre d'un angle, porte à une distance en cases et peut balayer.
 * Les murs l'arrêtent : on le coupe par le polygone de visibilité de son point de départ.
 * Tout se calcule sur l'écran, rien n'est écrit en base : c'est de l'affichage.
 */
import { inPolygon, type Point } from "@/lib/map";

export type Cone = {
  /** Ouverture, en degrés (360 : tout autour) */
  fov: number;
  /** Portée, en cases */
  range: number;
  /** Balayage : amplitude de chaque côté, en degrés */
  sweep: number;
  /** 0 : fixe ; 1 : lent ; 2 : rapide */
  speed: number;
  /** Les joueurs voient-ils le cône ? */
  show: boolean;
};
/** Cône d'un pion : il porte aussi sa direction (celle d'une caméra est sa rotation). */
export type TokenCone = Cone & { dir: number };

export const DEFAULT_CONE: Cone = { fov: 75, range: 6, sweep: 0, speed: 0, show: true };
export const FOV_PRESETS = [
  { value: 45, label: "Étroit", hint: "Un couloir, une porte." },
  { value: 75, label: "Normal", hint: "Le regard d’une caméra ou d’un garde." },
  { value: 120, label: "Large", hint: "Toute une pièce devant soi." },
  { value: 360, label: "Tout autour", hint: "Voit dans toutes les directions." },
];
export const SPEEDS = [
  { value: 0, label: "Fixe", hint: "Regarde toujours au même endroit." },
  { value: 1, label: "Lent", hint: "Balaye de gauche à droite, un aller-retour en 8 secondes." },
  { value: 2, label: "Rapide", hint: "Balaye de gauche à droite, un aller-retour en 4 secondes." },
];
const PERIOD: Record<number, number> = { 1: 8000, 2: 4000 };
export const RANGE_MAX = 40;

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const round = (n: number) => Math.round(n * 100) / 100;
export const normDeg = (d: number) => round(((d % 360) + 360) % 360);

/** Relit les réglages d'un cône ; ce qui est illisible reprend la valeur par défaut. */
export function readConeFields(o: Record<string, unknown>): Cone {
  return {
    fov: Math.round(num(o["fov"], 10, 360, DEFAULT_CONE.fov)),
    range: round(num(o["range"], 0.5, RANGE_MAX, DEFAULT_CONE.range)),
    sweep: Math.round(num(o["sweep"], 0, 90, DEFAULT_CONE.sweep)),
    speed: Math.round(num(o["speed"], 0, 2, DEFAULT_CONE.speed)),
    show: typeof o["show"] === "boolean" ? o["show"] : DEFAULT_CONE.show,
  };
}
/** Colonne `cone` d'un pion : null = pas de champ de vision. */
export function readTokenCone(raw: unknown): TokenCone | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return { dir: normDeg(num(o["dir"], -3600, 3600, 0)), ...readConeFields(o) };
}

/** Direction du regard à l'instant `t` (en millisecondes), balayage compris. */
export function lookAt(dir: number, c: Cone, t: number) {
  const period = PERIOD[c.speed];
  if (!period || !c.sweep || c.fov >= 360) return dir;
  return dir + c.sweep * Math.sin((2 * Math.PI * t) / period);
}

/** Vecteur unitaire d'une direction : 0 = vers le haut, 90 = vers la droite. */
const unit = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
};
/** Écart d'angle, de 0 à 180 degrés. */
const gap = (a: number, b: number) => {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return d > 180 ? 360 - d : d;
};

/**
 * Le point est-il dans le cône ? Portée, ouverture, puis murs : `sight` est le polygone de
 * visibilité du point de départ (sans lui, les murs ne comptent pas).
 */
export function inCone(origin: Point, look: number, c: Cone, p: Point, sight?: Point[]) {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d > c.range) return false;
  if (d > 0.01 && c.fov < 360) {
    const toward = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (gap(toward, look) > c.fov / 2) return false;
  }
  return !sight || sight.length < 3 || inPolygon(p, sight);
}

/** Contour du cône sans les murs (secteur de disque), en cases. */
export function sectorPoints(origin: Point, look: number, c: Cone, steps = 24): Point[] {
  const at = (deg: number) => {
    const u = unit(deg);
    return { x: origin.x + u.x * c.range, y: origin.y + u.y * c.range };
  };
  if (c.fov >= 360) return Array.from({ length: steps * 2 }, (_, i) => at((i * 360) / (steps * 2)));
  const start = look - c.fov / 2;
  const arc = Array.from({ length: steps + 1 }, (_, i) => at(start + (i * c.fov) / steps));
  return [origin, ...arc];
}

export type ConeSource = {
  id: string;
  label: string;
  origin: Point;
  dir: number;
  cone: Cone;
  sight?: Point[];
};
export type Spot = { source: string; sourceLabel: string; target: string; targetLabel: string };

/** Qui est vu, et par qui, à l'instant `t`. */
export function spotted(
  sources: ConeSource[],
  targets: { id: string; label: string; x: number; y: number }[],
  t: number,
): Spot[] {
  const out: Spot[] = [];
  for (const s of sources) {
    const look = lookAt(s.dir, s.cone, t);
    for (const p of targets)
      if (inCone(s.origin, look, s.cone, p, s.sight))
        out.push({ source: s.id, sourceLabel: s.label, target: p.id, targetLabel: p.label });
  }
  return out;
}

/** Nom d'une direction, pour la lire sans boussole. */
export function directionName(deg: number) {
  const names = [
    "haut",
    "haut-droite",
    "droite",
    "bas-droite",
    "bas",
    "bas-gauche",
    "gauche",
    "haut-gauche",
  ];
  return names[Math.round(normDeg(deg) / 45) % 8]!;
}
