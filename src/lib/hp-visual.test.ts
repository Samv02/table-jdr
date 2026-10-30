import { describe, expect, it } from "vitest";
import { HP_VISUALS, fillRow, hpLevel, hpVisualsFor } from "./hp-visual";
import { PRESETS, normalizeUniverse } from "./universe";

describe("hpLevel", () => {
  it("follows the four health states", () => {
    expect(hpLevel(20, 20)).toBe("stable");
    expect(hpLevel(10, 20)).toBe("blesse");
    expect(hpLevel(5, 20)).toBe("critique");
    expect(hpLevel(0, 20)).toBe("mourant");
  });
});

describe("fillRow", () => {
  it("empties icons one by one", () => {
    expect(fillRow(10, 20, 4)).toEqual([1, 1, 0, 0]);
    expect(fillRow(5, 20, 2)).toEqual([0.5, 0]);
  });
  it("never overflows", () => {
    expect(fillRow(99, 20, 2)).toEqual([1, 1]);
    expect(fillRow(-3, 20, 2)).toEqual([0, 0]);
    expect(fillRow(5, 0, 2)).toEqual([0, 0]);
  });
});

describe("hpVisualsFor", () => {
  it("puts what suits the theme first and None last", () => {
    const list = hpVisualsFor("horreur");
    expect(list[0]?.recommended).toBe(true);
    expect(list.at(-1)?.key).toBe("none");
    expect(list).toHaveLength(HP_VISUALS.length);
  });
  it.each(PRESETS.map((p) => [p.id, p.universe.theme.hpVisual] as const))(
    "%s starts with a suggested visual",
    (id, visual) => {
      expect(hpVisualsFor(id).find((v) => v.key === visual)?.recommended).toBe(true);
    },
  );
});

describe("normalizeUniverse", () => {
  it("keeps a valid choice and refuses an unknown one", () => {
    expect(normalizeUniverse({ preset: "fantasy", theme: { hpVisual: "candle" } }).theme.hpVisual).toBe(
      "candle",
    );
    expect(normalizeUniverse({ preset: "fantasy", theme: { hpVisual: "x" } }).theme.hpVisual).toBe(
      "hearts",
    );
  });
  it("respects a table that had turned the ECG off", () => {
    const u = normalizeUniverse({ preset: "cyberpunk", modules: { ecg: false } });
    expect(u.theme.hpVisual).toBe("none");
  });
});
