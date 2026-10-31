import { describe, expect, it } from "vitest";
import {
  pageChanged,
  pageErrors,
  searchPages,
  UNIVERSE_PAGES,
  universePage,
} from "./universe-pages";
import { presetById, PRESETS } from "./universe";

describe("universe pages", () => {
  it("gives every page a unique id", () => {
    const ids = UNIVERSE_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("falls back to the first page", () => {
    expect(universePage("inconnu").id).toBe("modele");
    expect(universePage(undefined).id).toBe("modele");
  });
  it("finds a setting without its exact title or accents", () => {
    expect(searchPages("mana").map((p) => p.id)).toContain("sante");
    expect(searchPages("degats").map((p) => p.id)).toContain("combat");
    expect(searchPages("PARCHEMIN").map((p) => p.id)).toContain("decor");
    expect(searchPages("")).toHaveLength(UNIVERSE_PAGES.length);
  });
  it("marks only the page that changed, on every preset", () => {
    for (const { id } of PRESETS) {
      const saved = presetById(id);
      const draft = {
        ...saved,
        theme: { ...saved.theme, atmosphere: saved.theme.atmosphere === "fog" ? "rain" : "fog" },
      } as typeof saved;
      const changed = UNIVERSE_PAGES.filter((p) => pageChanged(p, draft, saved)).map((p) => p.id);
      expect(changed).toEqual(["decor"]);
    }
  });
  it("sends each formula error to its page", () => {
    const errors = { hpMax: "x", gauge2: "y", skillBase: "z" };
    expect(pageErrors(universePage("sante"), errors)).toBe(2);
    expect(pageErrors(universePage("jets"), errors)).toBe(1);
    expect(pageErrors(universePage("combat"), errors)).toBe(0);
  });
});
