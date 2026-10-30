import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identity: {
    userId: "first",
    isGm: false,
    active: null as { id: string; handle: string | null } | null,
  },
}));

vi.mock("@/lib/active-character", () => ({
  useIdentity: () => mocks.identity,
  charLabel: (active: { handle: string | null } | null) => active?.handle ?? null,
}));
vi.mock("@/lib/profile", () => ({ useProfiles: () => ({}) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/dice.functions", () => ({ rollDice: {} }));
vi.mock("@/integrations/supabase/client", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: () => ({
        select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }),
      }),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

import { DicePanel } from "./DicePanel";

const foreignRoll = {
  id: "roll-from-other-player",
  user_id: "someone-else",
  label: "Esquive",
  dice_count: 2,
  dice_sides: 10,
  modifier: 0,
  results: [3, 4],
  total: 7,
  is_secret: false,
  created_at: new Date("2026-10-29T00:00:00Z").toISOString(),
  author_name: null,
  character_name: null,
  display_name: "dexter",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("roll feed notifications", () => {
  it("adds another player's roll to the feed without popping any notification", async () => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    const view = render(<DicePanel />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent("roll:new", { detail: foreignRoll }));
    });

    expect(document.querySelector("[role=alert]")).toBeNull();
    expect(view.baseElement.textContent).toContain("dexter");
    expect(document.body.textContent).not.toContain("Esquive : 7");
  });
});
