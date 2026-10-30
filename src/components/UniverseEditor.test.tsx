import { act, fireEvent, render } from "@testing-library/react";
import { useCallback, useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { UniverseContext } from "@/lib/universe-context";
import { DEFAULT_UNIVERSE, type Universe } from "@/lib/universe";

vi.mock("@/components/ConfirmDialog", () => ({ confirmAction: async () => true }));

import { UniverseEditor } from "./UniverseEditor";

const previews: (Universe | null)[] = [];

/** Même règle que UniverseProvider : l'aperçu remplace l'univers affiché, pas l'univers enregistré. */
function Harness({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Universe | null>(null);
  const preview = useCallback((next: Universe | null) => {
    previews.push(next);
    setDraft(next);
  }, []);
  return (
    <UniverseContext.Provider
      value={{
        universe: draft ?? DEFAULT_UNIVERSE,
        saved: DEFAULT_UNIVERSE,
        save: async () => null,
        preview,
      }}
    >
      {children}
    </UniverseContext.Provider>
  );
}

describe("UniverseEditor preview", () => {
  it("stays on the draft instead of switching the preview off and on", async () => {
    const { container } = render(
      <Harness>
        <UniverseEditor />
      </Harness>,
    );
    const preset = [...container.querySelectorAll<HTMLButtonElement>(".uni-preset")].find(
      (b) => !b.classList.contains("on"),
    );
    await act(async () => {
      fireEvent.click(preset as HTMLButtonElement);
      await new Promise((done) => setTimeout(done, 50));
    });
    expect(previews.at(-1)).not.toBeNull();
    expect(previews.slice(previews.findIndex(Boolean)).every(Boolean)).toBe(true);
  });
});
