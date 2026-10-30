import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DieIcon } from "./DieIcon";
import { useUniverse } from "@/lib/universe-context";
import {
  critLabel,
  dieClass,
  fumbleLabel,
  isCritical,
  isFumble,
  rollVerdict,
} from "@/lib/universe";

export type PendingRoll = {
  dice_count: number;
  dice_sides: number;
  modifier: number;
  label: string | null;
  display_name: string | null;
  is_secret: boolean;
  target?: number | null;
};

export type AnimationResult = PendingRoll & { results: number[]; total: number };

export function RollAnimation({
  pending,
  result,
  startedAt,
  onClose,
}: {
  pending: PendingRoll;
  result: AnimationResult | null;
  startedAt: number;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"rolling" | "done">("rolling");
  const { universe: u } = useUniverse();
  const [displayValues, setDisplayValues] = useState<number[]>(Array(pending.dice_count).fill(0));
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    interval.current = setInterval(() => {
      setDisplayValues(
        Array.from(
          { length: pending.dice_count },
          () => Math.floor(Math.random() * pending.dice_sides) + 1,
        ),
      );
    }, 50);
    return () => {
      if (interval.current !== null) clearInterval(interval.current);
      interval.current = null;
    };
  }, [pending]);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(
      () => {
        if (interval.current !== null) clearInterval(interval.current);
        interval.current = null;
        setPhase("done");
      },
      Math.max(0, 650 - (Date.now() - startedAt)),
    );
    return () => clearTimeout(timer);
  }, [result, startedAt]);

  const done = phase === "done" && result !== null;
  const outcome = done ? { ...result, target: result.target ?? pending.target ?? null } : null;
  const crit = !!outcome && isCritical(u, outcome);
  const fumble = !!outcome && isFumble(u, outcome);
  const verdict = outcome ? rollVerdict(outcome) : null;
  // Rendu directement dans <body> : un parent avec transform / backdrop-filter décalerait sinon
  // l'overlay (position:fixed devient alors relatif à ce parent, d'où le jet décentré sur mobile).
  const overlay = (
    <div
      className={`fx on ${done ? "done" : ""}`}
      role="dialog"
      aria-label="Résultat du jet"
      onClick={onClose}
    >
      <div className="fx-card">
        <div className="fx-who">
          {pending.display_name}
          {pending.is_secret ? " · JET SECRET" : ""}
        </div>
        <div className="fx-label">
          {pending.label || `${pending.dice_count}d${pending.dice_sides}`}
        </div>
        <div className={`fx-dice ${pending.dice_count > 5 ? "many" : ""}`}>
          {Array.from({ length: pending.dice_count }, (_, i) => {
            const value = phase === "done" ? result?.results[i] : displayValues[i];
            const highlight = outcome ? dieClass(u, outcome, outcome.results[i] ?? 0) : "spin";
            return (
              <div key={i} className={`fx-die ${highlight}`}>
                <DieIcon sides={pending.dice_sides} />
                <b className={String(value ?? "").length > 2 ? "wide-value" : ""}>{value || "?"}</b>
              </div>
            );
          })}
        </div>
        <div className="fx-calc">
          {done
            ? `[${result.results.join(", ")}]${result.modifier ? (result.modifier > 0 ? ` + ${result.modifier}` : ` − ${-result.modifier}`) : ""}${outcome?.target != null ? ` ≤ ${outcome.target}` : ""}`
            : ""}
        </div>
        <div className="fx-total">{done ? result.total : null}</div>
        {verdict && (
          <div className={`fx-tag verdict ${verdict.ok ? "ok" : "ko"}`}>{verdict.text}</div>
        )}
        {crit && outcome && <div className="fx-tag crit">{critLabel(u, outcome)}</div>}
        {fumble && outcome && <div className="fx-tag fumble">{fumbleLabel(u, outcome)}</div>}
      </div>
    </div>
  );
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
