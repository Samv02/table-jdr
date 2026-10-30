export type Size = { w: number; h: number };
/** Translation (px) + zoom applied to the image drawn at its "cover" base size. */
export type View = { x: number; y: number; z: number };

const MAX_ZOOM = 4;

/** Size of an image scaled to cover the screen (like object-fit: cover). */
export function coverSize(natural: Size, screen: Size): Size {
  if (!natural.w || !natural.h) return { w: screen.w, h: screen.h };
  const k = Math.max(screen.w / natural.w, screen.h / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

/** Keep zoom in range and the image covering the whole screen. */
export function clampView(v: View, base: Size, screen: Size): View {
  const z = Math.min(MAX_ZOOM, Math.max(1, v.z));
  const minX = Math.min(0, screen.w - base.w * z);
  const minY = Math.min(0, screen.h - base.h * z);
  return { z, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
}

export function centeredView(base: Size, screen: Size): View {
  return clampView({ z: 1, x: (screen.w - base.w) / 2, y: (screen.h - base.h) / 2 }, base, screen);
}

export function panBy(v: View, dx: number, dy: number, base: Size, screen: Size): View {
  return clampView({ ...v, x: v.x + dx, y: v.y + dy }, base, screen);
}

/** Zoom by factor around screen point (px, py). */
export function zoomAt(
  v: View,
  factor: number,
  px: number,
  py: number,
  base: Size,
  screen: Size,
): View {
  const z = Math.min(MAX_ZOOM, Math.max(1, v.z * factor));
  const k = z / v.z;
  return clampView({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, base, screen);
}
