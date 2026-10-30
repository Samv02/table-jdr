import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

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
      const move = (ev: PointerEvent) => {
        const over = document.elementFromPoint(ev.clientX, ev.clientY);
        const found = over?.closest<HTMLElement>(selector) ?? null;
        mark(found && found !== source ? found : null);
      };
      const finish = () => {
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
