import { useEffect, useRef } from "react";

const CLEAR_AFTER_MS = 8000;

/** Message d'erreur discret affiché dans la page, près de l'action concernée (jamais de pop-up). */
export function InlineError({ message, onClear }: { message: string | null; onClear: () => void }) {
  // Le minuteur ne repart pas à chaque rendu (temps réel) : seul un nouveau message le relance.
  const clear = useRef(onClear);
  clear.current = onClear;
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => clear.current(), CLEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <p className="note error" role="alert">
      {message}
    </p>
  );
}
