import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { pinnedFeedKey, usePinnedFeed } from "./pinned-feed";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("restores the pin after remount and shares it with other controls", () => {
  const first = renderHook(() => usePinnedFeed("player"));
  const header = renderHook(() => usePinnedFeed("player"));
  act(() => first.result.current.setPinned(true));
  expect(localStorage.getItem(pinnedFeedKey("player"))).toBe("true");
  expect(header.result.current.pinned).toBe(true);
  first.unmount();
  const restored = renderHook(() => usePinnedFeed("player"));
  expect(restored.result.current.pinned).toBe(true);
  act(() => restored.result.current.setPinned(false));
  expect(header.result.current.pinned).toBe(false);
});

it("keeps each person's preference separate", () => {
  localStorage.setItem(pinnedFeedKey("gm"), "true");
  const view = renderHook(({ id }) => usePinnedFeed(id), { initialProps: { id: "gm" } });
  expect(view.result.current.pinned).toBe(true);
  view.rerender({ id: "player" });
  expect(view.result.current.pinned).toBe(false);
  expect(localStorage.getItem(pinnedFeedKey("gm"))).toBe("true");
});
