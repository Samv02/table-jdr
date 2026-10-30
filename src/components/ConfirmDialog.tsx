import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TriangleAlert } from "lucide-react";

/**
 * Confirmation dans l'appli (remplace window.confirm du navigateur).
 *
 *   if (!(await confirmAction({ title: "Supprimer « Sword » ?" }))) return;
 *
 * <ConfirmHost /> est monté une seule fois dans __root.tsx.
 */
export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((p: Pending) => void) | null = null;

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Sans hôte monté (tests isolés), on ne supprime rien par sécurité
    if (!show) return resolve(false);
    show({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (p) =>
      setPending((old) => {
        old?.resolve(false); // une seule confirmation à la fois
        return p;
      });
    return () => {
      show = null;
    };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus(); // « Annuler » sélectionné par défaut : Entrée ne supprime pas par erreur
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (!pending || typeof document === "undefined") return null;
  return createPortal(
    <div className="confirm-veil" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div
        className="confirm-box cut"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={pending.message ? "confirm-msg" : undefined}
      >
        <div className="confirm-head">
          <TriangleAlert size={18} aria-hidden="true" />
          <span>Confirmation</span>
        </div>
        <h3 id="confirm-title">{pending.title}</h3>
        {pending.message && <p id="confirm-msg">{pending.message}</p>}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={() => close(false)}>
            {pending.cancelLabel ?? "Annuler"}
          </button>
          <button type="button" className="btn red" onClick={() => close(true)}>
            {pending.confirmLabel ?? "Supprimer"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
