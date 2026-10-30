import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

const EDGE = 70;
const SCROLL_STEP = 16;
const SCROLL_EVERY_MS = 30;

/** Le premier parent qui défile vraiment : ici un conteneur de l'appli, pas la fenêtre. */
function scrollArea(from: HTMLElement): Element | Window {
  for (let el = from.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (/auto|scroll/.test(overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return window;
}

/**
 * Glisser-déposer au doigt et à la souris (événements « pointer », sans bibliothèque).
 * La cible est l'élément portant data-<attr> sous le pointeur : `attr` en camelCase, comme dataset.
 * La zone d'arrivée reçoit la classe drop-target, l'élément déplacé la classe dragging.
 */
export function useDragSort(attr: string, onDrop: (from: string, to: string) => void) {
  const drop = useRef(onDrop);
  drop.current = onDrop;
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  return useCallback(
    (e: ReactPointerEvent<HTMLElement>, from: string) => {
      e.preventDefault();
      const selector = `[data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;
      const source = e.currentTarget.closest<HTMLElement>(selector);
      source?.classList.add("dragging");
      let target: HTMLElement | null = null;
      const mark = (next: HTMLElement | null) => {
        if (next === target) return;
        target?.classList.remove("drop-target");
        next?.classList.add("drop-target");
        target = next;
      };
      const area = scrollArea(e.currentTarget);
      let last = { x: e.clientX, y: e.clientY };
      const look = () => {
        const over = document.elementFromPoint(last.x, last.y);
        const found = over?.closest<HTMLElement>(selector) ?? null;
        mark(found && found !== source ? found : null);
      };
      const move = (ev: PointerEvent) => {
        last = { x: ev.clientX, y: ev.clientY };
        look();
      };
      // Près du haut ou du bas de l'écran, la page défile pour atteindre une cible hors champ
      const scroller = setInterval(() => {
        const step =
          last.y < EDGE ? -SCROLL_STEP : last.y > window.innerHeight - EDGE ? SCROLL_STEP : 0;
        if (!step) return;
        area.scrollBy({ top: step, behavior: "instant" });
        look();
      }, SCROLL_EVERY_MS);
      const finish = () => {
        clearInterval(scroller);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", finish);
        source?.classList.remove("dragging");
        mark(null);
        stop.current = null;
      };
      const up = () => {
        const to = target?.dataset[attr];
        finish();
        if (to && to !== from) drop.current(from, to);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", finish);
      stop.current = finish;
    },
    [attr],
  );
}
