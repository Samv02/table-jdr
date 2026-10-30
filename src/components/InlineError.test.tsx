import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineError } from "./InlineError";

function Harness({ initial }: { initial: string | null }) {
  const [err, setErr] = useState(initial);
  const [, setTick] = useState(0);
  return (
    <>
      <button onClick={() => setTick((t) => t + 1)}>rendu</button>
      <InlineError message={err} onClear={() => setErr(null)} />
    </>
  );
}

describe("erreur affichée dans la page", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("n'affiche rien sans message", () => {
    render(<Harness initial={null} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("affiche le message puis l'efface après 8 s, même si la page se redessine", () => {
    render(<Harness initial="Ce pseudo est déjà pris." />);
    expect(screen.getByRole("alert").textContent).toBe("Ce pseudo est déjà pris.");
    act(() => vi.advanceTimersByTime(5000));
    // Un rendu (temps réel) ne relance pas le minuteur
    act(() => screen.getByText("rendu").click());
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
