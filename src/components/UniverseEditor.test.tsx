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
        <UniverseEditor page={undefined} onPage={() => undefined} />
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

  it("shows a preset without any dialog, then goes back to the previous draft", async () => {
    const { container, getByRole, queryByRole } = render(
      <Harness>
        <UniverseEditor page={undefined} onPage={() => undefined} />
      </Harness>,
    );
    const [first, second] = [
      ...container.querySelectorAll<HTMLButtonElement>(".uni-preset"),
    ].filter((b) => !b.classList.contains("on"));
    fireEvent.click(first as HTMLButtonElement);
    fireEvent.click(second as HTMLButtonElement);
    await act(async () => undefined);
    expect(previews.at(-1)).not.toBeNull();
    expect(queryByRole("button", { name: /Enregistrer/ })).toBeNull();

    fireEvent.click(getByRole("button", { name: /Revenir/ }));
    await act(async () => undefined);
    expect(previews.at(-1)).toBeNull();
    expect(getByRole("button", { name: /Enregistrer/ })).toBeTruthy();
  });

  it("keeps a preset once it is confirmed", async () => {
    const { container, getByRole } = render(
      <Harness>
        <UniverseEditor page={undefined} onPage={() => undefined} />
      </Harness>,
    );
    const preset = [...container.querySelectorAll<HTMLButtonElement>(".uni-preset")].find(
      (b) => !b.classList.contains("on"),
    );
    fireEvent.click(preset as HTMLButtonElement);
    fireEvent.click(getByRole("button", { name: /Garder/ }));
    await act(async () => undefined);
    expect(previews.at(-1)).not.toBeNull();
    expect((getByRole("button", { name: /Enregistrer/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("does not save anything when previewing the player view", async () => {
    const save = vi.fn(async () => null);
    const { getByRole } = render(
      <UniverseContext.Provider
        value={{
          universe: DEFAULT_UNIVERSE,
          saved: DEFAULT_UNIVERSE,
          save,
          preview: () => undefined,
        }}
      >
        <UniverseEditor page={undefined} onPage={() => undefined} />
      </UniverseContext.Provider>,
    );
    await act(async () => {
      fireEvent.click(getByRole("button", { name: /Vue joueur/ }));
    });
    expect(getByRole("dialog", { name: "Vue joueur" })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(save).not.toHaveBeenCalled();
  });
});
