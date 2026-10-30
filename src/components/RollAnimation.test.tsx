import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RollAnimation, type PendingRoll } from "./RollAnimation";
import { UniverseContext } from "@/lib/universe-context";
import { presetById } from "@/lib/universe";
const withUniverse = (id: string, el: React.ReactElement) => (
  <UniverseContext.Provider
    value={{
      universe: presetById(id),
      saved: presetById(id),
      save: async () => null,
      preview: () => {},
    }}
  >
    {el}
  </UniverseContext.Provider>
);

const pending: PendingRoll = {
  dice_count: 5,
  dice_sides: 100,
  modifier: 0,
  label: null,
  display_name: "MJ",
  is_secret: true,
};
const result = { ...pending, results: [60, 61, 42, 95, 81], total: 339 };
const values = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".fx-die b"), (die) => Number(die.textContent));
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("server-authoritative dice animation", () => {
  it("displays exactly [60,61,42,95,81] after the minimum 650ms and never overwrites them", () => {
    const startedAt = Date.now();
    const view = render(
      <RollAnimation pending={pending} result={null} startedAt={startedAt} onClose={() => {}} />,
    );
    act(() => vi.advanceTimersByTime(100));
    expect(values(view.baseElement)).toEqual([51, 51, 51, 51, 51]);
    view.rerender(
      <RollAnimation pending={pending} result={result} startedAt={startedAt} onClose={() => {}} />,
    );
    act(() => vi.advanceTimersByTime(549));
    expect(values(view.baseElement)).toEqual([51, 51, 51, 51, 51]);
    expect(view.baseElement.querySelector(".fx-total")?.textContent).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(values(view.baseElement)).toEqual([60, 61, 42, 95, 81]);
    expect(view.baseElement.querySelector(".fx-total")?.textContent).toBe("339");
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(2000));
    expect(values(view.baseElement)).toEqual([60, 61, 42, 95, 81]);
  });

  it("keeps rolling until a late server response arrives", () => {
    const startedAt = Date.now();
    const view = render(
      <RollAnimation pending={pending} result={null} startedAt={startedAt} onClose={() => {}} />,
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(vi.getTimerCount()).toBe(1);
    view.rerender(
      <RollAnimation pending={pending} result={result} startedAt={startedAt} onClose={() => {}} />,
    );
    act(() => vi.advanceTimersByTime(0));
    expect(values(view.baseElement)).toEqual(result.results);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards both timers on closing or replacing a roll", () => {
    const startedAt = Date.now();
    const view = render(
      <RollAnimation
        key={1}
        pending={pending}
        result={result}
        startedAt={startedAt}
        onClose={() => {}}
      />,
    );
    act(() => vi.advanceTimersByTime(100));
    expect(vi.getTimerCount()).toBe(2);
    view.rerender(
      <RollAnimation
        key={2}
        pending={pending}
        result={null}
        startedAt={Date.now()}
        onClose={() => {}}
      />,
    );
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(650));
    expect(values(view.baseElement)).toEqual([51, 51, 51, 51, 51]);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("turns a natural 10 on a single d10 green, and leaves every other face yellow", () => {
    const critPending: PendingRoll = {
      dice_count: 1,
      dice_sides: 10,
      modifier: 0,
      label: "Esquive",
      display_name: "SUDO",
      is_secret: false,
    };
    const crit = { ...critPending, results: [10], total: 10 };
    const view = render(
      withUniverse(
        "cyberpunk",
        <RollAnimation
          pending={critPending}
          result={crit}
          startedAt={Date.now()}
          onClose={() => {}}
        />,
      ),
    );
    act(() => vi.advanceTimersByTime(650));
    expect(view.baseElement.querySelector(".fx-die.max.crit b")?.textContent).toBe("10");

    const plain = { ...critPending, results: [9], total: 9 };
    view.unmount();
    const second = render(
      withUniverse(
        "cyberpunk",
        <RollAnimation
          pending={critPending}
          result={plain}
          startedAt={Date.now()}
          onClose={() => {}}
        />,
      ),
    );
    act(() => vi.advanceTimersByTime(650));
    expect(second.baseElement.querySelector(".fx-die.max.crit")).toBeNull();
    expect(second.baseElement.querySelector(".fx-tag.crit")).toBeNull();
  });

  it("univers d20 : le 20 naturel est critique, pas le 10", () => {
    const p: PendingRoll = {
      dice_count: 1,
      dice_sides: 20,
      modifier: 3,
      label: "Athlétisme",
      display_name: "LYRA",
      is_secret: false,
    };
    const view = render(
      withUniverse(
        "fantasy",
        <RollAnimation
          pending={p}
          result={{ ...p, results: [20], total: 23 }}
          startedAt={Date.now()}
          onClose={() => {}}
        />,
      ),
    );
    act(() => vi.advanceTimersByTime(650));
    expect(view.baseElement.querySelector(".fx-tag.crit")?.textContent).toBe(
      "20 NATUREL · CRITIQUE",
    );
  });
  it("jet de pourcentage : affiche la réussite et les degrés", () => {
    const p: PendingRoll = {
      dice_count: 1,
      dice_sides: 100,
      modifier: 0,
      label: "Esquive",
      display_name: "GRETA",
      is_secret: false,
      target: 45,
    };
    const view = render(
      withUniverse(
        "grimdark",
        <RollAnimation
          pending={p}
          result={{ ...p, results: [12], total: 12 }}
          startedAt={Date.now()}
          onClose={() => {}}
        />,
      ),
    );
    act(() => vi.advanceTimersByTime(650));
    expect(view.baseElement.querySelector(".fx-tag.verdict.ok")?.textContent).toBe(
      "RÉUSSITE · +3 DR",
    );
    expect(view.baseElement.querySelector(".fx-calc")?.textContent).toBe("[12] ≤ 45");
  });
});
