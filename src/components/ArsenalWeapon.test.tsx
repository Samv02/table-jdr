import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArsenalWeapon } from "./ArsenalWeapon";
import type { AmmoEntry } from "@/lib/character-import";
import type { SheetWeapon } from "@/lib/sheet";
import { UniverseContext } from "@/lib/universe-context";
import { presetById } from "@/lib/universe";

const cp = { universe: presetById("cyberpunk"), save: async () => null, preview: () => {} };

const weapon: SheetWeapon = {
  name: "Mitraillette",
  capacity: 30,
  ammoRaw: "30",
  rof: 2,
  skill: "Pistolets",
  dmg: "2d6",
  note: "",
};
const attack = { name: "Pistolets", base: 8, stat: "REF", unlearned: false };
function setup(ammo: AmmoEntry = { mag: 30, spare: 1, loose: 0 }) {
  const onAmmo = vi.fn((update: (a: AmmoEntry) => AmmoEntry) => {
    ammo = update(ammo);
  });
  const onRoll = vi.fn();
  render(
    <UniverseContext.Provider value={cp}>
      <ArsenalWeapon
        weapon={weapon}
        ammo={ammo}
        attack={attack}
        autoAttack={{ ...attack, name: "Tir automatique (Autofire)", base: 2 }}
        damage="2d6"
        canEdit
        canRoll
        onAmmo={onAmmo}
        onRoll={onRoll}
      />
    </UniverseContext.Provider>,
  );
  return { onAmmo, onRoll, read: () => ammo };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("arsenal actions", () => {
  it("zero spare magazines leaves the loaded rounds available", () => {
    const result = setup({ mag: 30, spare: 0, loose: 0 });
    fireEvent.click(screen.getByRole("button", { name: "TIR" }));
    expect(result.read()).toEqual({ mag: 29, spare: 0, loose: 0 });
  });
  it("packs loose rounds into one spare without changing loaded rounds", () => {
    const result = setup({ mag: 30, spare: 0, loose: 42 });
    fireEvent.click(screen.getByRole("button", { name: "Vrac → rechanges" }));
    expect(result.read()).toEqual({ mag: 30, spare: 1, loose: 12 });
  });
  it("persists Auto ×10 immediately without waiting for shot animations", () => {
    vi.useFakeTimers();
    const result = setup();
    fireEvent.click(screen.getByRole("button", { name: /^AUTO ×10$/ }));
    expect(result.read().mag).toBe(20);
    expect(result.onAmmo).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1200));
    expect(result.read().mag).toBe(20);
  });
  it("burst consumes exactly 2 rounds", () => {
    vi.useFakeTimers();
    const result = setup();
    fireEvent.click(screen.getByRole("button", { name: "TIR ×2" }));
    expect(result.read().mag).toBe(28);
  });
  it("reload persists before the 700ms progress finishes", () => {
    vi.useFakeTimers();
    const result = setup({ mag: 10, spare: 1, loose: 0 });
    fireEvent.click(screen.getByRole("button", { name: "RECHARGER" }));
    expect(result.read()).toEqual({ mag: 30, spare: 0, loose: 10 });
    act(() => vi.advanceTimersByTime(700));
    expect(result.onAmmo).toHaveBeenCalledTimes(1);
  });
  it("successive loose-round increments update current state", () => {
    const result = setup();
    const plus = screen.getByRole("button", { name: "Augmenter Vrac" });
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(result.read().loose).toBe(3);
  });
  it("allows entering a loose-round quantity without accepting negative values", () => {
    const result = setup();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Vrac (balles)" }), {
      target: { value: "42" },
    });
    expect(result.read().loose).toBe(42);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Vrac (balles)" }), {
      target: { value: "-1" },
    });
    expect(result.read().loose).toBe(42);
  });
});
