import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableMusic } from "./TableMusic";

const mocks = vi.hoisted(() => ({
  identity: { userId: "first", isGm: false },
  music: {
    source_id: "video",
    source_type: "video",
    volume: 40,
    is_playing: true,
    position_sec: 0,
  },
}));
vi.mock("@/lib/active-character", () => ({ useIdentity: () => mocks.identity }));
vi.mock("@/lib/table-context", () => ({
  useTable: () => ({ music: mocks.music, serverNow: () => 0, refresh: vi.fn(), clean: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.YT;
  delete window.onYouTubeIframeAPIReady;
  mocks.identity = { userId: "first", isGm: false };
});

describe("YouTube readiness", () => {
  it("never syncs a replacement before its own onReady or accepts stale readiness", () => {
    const instances: { api: Record<string, unknown>; events: { onReady: () => void } }[] = [];
    window.YT = {
      Player: vi.fn(function (_element: HTMLElement, options: Record<string, unknown>) {
        const api = { destroy: vi.fn() };
        instances.push({ api, events: options["events"] as { onReady: () => void } });
        return api;
      }) as unknown as NonNullable<typeof window.YT>["Player"],
    };
    mocks.identity = { userId: "", isGm: false };
    const view = render(
      <TableMusic>
        <span>Fiche</span>
      </TableMusic>,
    );
    mocks.identity = { userId: "first", isGm: false };
    view.rerender(
      <TableMusic>
        <span>Fiche</span>
      </TableMusic>,
    );
    const first = instances[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("Player not created");
    const methods = () => ({
      loadVideoById: vi.fn(),
      cueVideoById: vi.fn(),
      loadPlaylist: vi.fn(),
      cuePlaylist: vi.fn(),
      setVolume: vi.fn(),
      getCurrentTime: () => 0,
      seekTo: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      getDuration: () => 0,
      getVideoData: () => ({}),
      getPlaylist: () => [],
      getPlaylistIndex: () => 0,
    });
    Object.assign(first.api, methods());
    act(() => first.events.onReady());
    fireEvent.click(screen.getByRole("button", { name: /Activer le son/ }));
    expect(first.api["setVolume"]).toHaveBeenCalledWith(40);
    mocks.identity = { userId: "second", isGm: false };
    expect(() =>
      view.rerender(
        <TableMusic>
          <span>Fiche</span>
        </TableMusic>,
      ),
    ).not.toThrow();
    const second = instances[1];
    if (!second) throw new Error("Replacement not created");
    act(() => first.events.onReady());
    expect(screen.getByRole("button", { name: /Activer le son/ })).toBeDisabled();
    const nextMethods = methods();
    Object.assign(second.api, nextMethods);
    act(() => second.events.onReady());
    fireEvent.click(screen.getByRole("button", { name: /Activer le son/ }));
    expect(nextMethods.loadVideoById).toHaveBeenCalledWith("video", 0);
    expect(nextMethods.setVolume).toHaveBeenCalledWith(40);
    // Réduire le lecteur ne coupe PAS la musique : le lecteur n'est pas détruit
    fireEvent.click(screen.getByRole("button", { name: "Réduire le lecteur" }));
    expect(second.api["destroy"]).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Agrandir le lecteur" })).toBeEnabled();
    // Volume perso : coupé chez moi → 0, puis rétabli → volume du MJ
    nextMethods.setVolume.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Couper le son chez moi" }));
    expect(nextMethods.setVolume).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "Rétablir le son" }));
    expect(nextMethods.setVolume).toHaveBeenLastCalledWith(40);
    fireEvent.click(screen.getByRole("button", { name: "Agrandir le lecteur" }));
    fireEvent.change(screen.getByRole("slider", { name: "Mon volume" }), {
      target: { value: "50" },
    });
    expect(nextMethods.setVolume).toHaveBeenLastCalledWith(20);
  });
});
describe("effectiveVolume", () => {
  it("multiplie le volume du MJ par le volume perso, 0 si coupé", async () => {
    const { effectiveVolume } = await import("./TableMusic");
    expect(effectiveVolume(40, 100, false)).toBe(40);
    expect(effectiveVolume(40, 50, false)).toBe(20);
    expect(effectiveVolume(80, 25, false)).toBe(20);
    expect(effectiveVolume(80, 100, true)).toBe(0);
    expect(effectiveVolume(undefined, 100, false)).toBe(50);
  });
});
