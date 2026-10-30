import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  identity: { userId: "user-me", isGm: false, active: { id: "char-a", handle: "alpha" } },
  handlers: {} as Record<string, (payload: { new: unknown }) => void>,
}));

vi.mock("@/lib/active-character", () => ({ useIdentity: () => mocks.identity }));
vi.mock("@/lib/table-context", () => ({
  useTable: () => ({
    party: [
      { character_id: "char-a", handle: "alpha", color: "cyan", avatar: null },
      { character_id: "char-b", handle: "bravo", color: "yellow", avatar: null },
    ],
  }),
}));
vi.mock("./ui/button", () => ({
  Button: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...(rest as object)}>{children}</button>
  ),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: (
      _event: string,
      filter: { table?: string; event?: string },
      cb: (payload: { new: unknown }) => void,
    ) => {
      if (filter?.table) mocks.handlers[`${filter.table}:${filter.event}`] = cb;
      return channel;
    },

    subscribe: (cb?: (status: string) => void) => {
      cb?.("SUBSCRIBED");
      return channel;
    },
  };
  return {
    supabase: {
      from: (table: string) =>
        table === "messages"
          ? {
              select: () => ({
                order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
              }),
            }
          : { select: () => Promise.resolve({ data: [], error: null }) },
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

import { Comms } from "./Comms";
import { toast } from "sonner";

const foreignMessage = {
  id: "msg-from-other-player",
  channel: "gm:char-a",
  sender_user: "someone-else",
  sender_character: "char-b",
  sender_name: "bravo",
  body: "Rendez-vous au bar, vite.",
  created_at: new Date("2026-10-29T00:00:00Z").toISOString(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("holo-net notifications", () => {
  it("counts another player's message without popping any notification", async () => {
    render(<Comms />);
    // Laisse le chargement initial se terminer avant de simuler la réception
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      mocks.handlers["messages:INSERT"]?.({ new: foreignMessage });
    });

    expect(toast).not.toHaveBeenCalled();
    // Le message arrive quand même : aperçu dans la liste + compteur de non-lus
    expect(document.body.textContent).toContain("Rendez-vous au bar, vite.");
    const fab = document.querySelector(".comms-fab");
    expect(fab?.getAttribute("aria-label")).toContain("non lu");
  });
});
