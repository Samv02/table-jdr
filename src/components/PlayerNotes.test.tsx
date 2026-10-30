import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  body: "Dette envers Rogue : 500 €$",
  upsert: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/integrations/supabase/client", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: { body: db.body } }),
    upsert: db.upsert,
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { from: () => chain, channel: () => channel, removeChannel: vi.fn() } };
});
import { PlayerNotes } from "./PlayerNotes";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  db.upsert.mockClear();
});

describe("bloc-notes privé", () => {
  it("le MJ lit les notes sans pouvoir les modifier", async () => {
    render(<PlayerNotes charId="c1" canWrite={false} />);
    expect(await screen.findByText("Dette envers Rogue : 500 €$")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("le joueur écrit et ses notes sont enregistrées automatiquement", async () => {
    render(<PlayerNotes charId="c1" canWrite />);
    const box = await screen.findByDisplayValue("Dette envers Rogue : 500 €$");
    vi.useFakeTimers();
    fireEvent.change(box, { target: { value: "Contact : Rogue (Afterlife)" } });
    expect(db.upsert).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(db.upsert).toHaveBeenCalledWith(
      { character_id: "c1", body: "Contact : Rogue (Afterlife)" },
      { onConflict: "character_id" },
    );
  });
});
