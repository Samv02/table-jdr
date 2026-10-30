import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const EDGE = 70;
const SCROLL_STEP = 16;
const SCROLL_EVERY_MS = 30;
const GHOST_WIDTH = 300;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Le premier parent qui défile vraiment : ici un conteneur de l'appli, pas la fenêtre. */
function scrollArea(from: HTMLElement): Element | Window {
  for (let el = from.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (/auto|scroll/.test(overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return window;
}

type DragOptions = {
  /** Nom de l'attribut data en camelCase, comme dans dataset */
  attr: string;
  /** Le pointeur passe sur une autre place : l'écran se réorganise en direct */
  onOver: (from: string, to: string) => void;
  onDrop: () => void;
  onCancel: () => void;
};

/**
 * Glisser-déposer au doigt et à la souris (événements « pointer », sans bibliothèque).
 * Une copie réduite suit le pointeur, l'élément d'origine reste comme emplacement,
 * Échap annule et la copie rejoint sa place d'arrivée au lâcher.
 */
export function useDragSort(options: DragOptions) {
  const latest = useRef(options);
  latest.current = options;
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  return useCallback((e: ReactPointerEvent<HTMLElement>, from: string) => {
    e.preventDefault();
    const { attr } = latest.current;
    const selector = `[data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;
    const source = e.currentTarget.closest<HTMLElement>(selector);
    if (!source) return;
    const box = source.getBoundingClientRect();
    const scale = Math.min(1, GHOST_WIDTH / box.width);
    const grabX = (e.clientX - box.left) * scale;
    const grabY = Math.min(e.clientY - box.top, 40) * scale;

    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute(`data-${attr}`);
    ghost.classList.add("drag-ghost");
    ghost.style.width = `${box.width}px`;
    document.body.append(ghost);
    source.classList.add("dragging");
    document.body.classList.add("is-dragging");

    const area = scrollArea(e.currentTarget);
    let last = { x: e.clientX, y: e.clientY };
    let lastTo: string | null = null;
    const place = () => {
      ghost.style.transform = `translate3d(${last.x - grabX}px, ${last.y - grabY}px, 0) scale(${scale}) rotate(1.5deg)`;
    };
    const look = () => {
      const over = document.elementFromPoint(last.x, last.y);
      const found = over?.closest<HTMLElement>(selector) ?? null;
      const to = found && found !== source ? (found.dataset[attr] ?? null) : null;
      if (to === lastTo) return;
      lastTo = to;
      if (to) latest.current.onOver(from, to);
    };
    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      place();
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
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      document.body.classList.remove("is-dragging");
      stop.current = null;
    };
    /** La copie rejoint la place finale avant de disparaître. */
    const settle = () => {
      requestAnimationFrame(() => {
        const end = source.getBoundingClientRect();
        const clear = () => {
          ghost.remove();
          source.classList.remove("dragging");
        };
        if (calm()) return clear();
        const fly = ghost.animate(
          [
            { transform: ghost.style.transform, opacity: 1 },
            { transform: `translate3d(${end.left}px, ${end.top}px, 0) scale(1)`, opacity: 0.2 },
          ],
          { duration: 200, easing: EASE, fill: "forwards" },
        );
        fly.onfinish = clear;
      });
    };
    const up = () => {
      finish();
      latest.current.onDrop();
      settle();
    };
    const cancel = () => {
      finish();
      latest.current.onCancel();
      settle();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") cancel();
    };
    place();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    stop.current = () => {
      finish();
      ghost.remove();
    };
  }, []);
}

/**
 * Anime les éléments vers leur nouvelle place quand `signature` change (technique FLIP).
 * Les positions sont relatives au conteneur : faire défiler la page n'anime rien.
 */
export function useFlip(
  container: RefObject<HTMLElement | null>,
  selector: string,
  attr: string,
  signature: string,
) {
  const places = useRef(new Map<string, { x: number; y: number }>());
  const previous = useRef(signature);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const animate = previous.current !== signature && !calm();
    previous.current = signature;
    const next = new Map<string, { x: number; y: number }>();
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const id = el.dataset[attr];
      if (!id) return;
      const box = el.getBoundingClientRect();
      const place = { x: box.left - origin.left, y: box.top - origin.top };
      next.set(id, place);
      const before = places.current.get(id);
      if (!animate || !before) return;
      const dx = before.x - place.x;
      const dy = before.y - place.y;
      if (!dx && !dy) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: 240,
        easing: EASE,
      });
    });
    places.current = next;
  });
}
