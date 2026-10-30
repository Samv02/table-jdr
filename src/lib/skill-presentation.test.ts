import { describe, expect, it } from "vitest";
import { orderedSkills, topSkillIndexes } from "./skill-presentation";
import { readStats } from "./sheet";
import { presetById } from "./universe";
const cp = presetById("cyberpunk");

describe("prototype skill ordering", () => {
  it("puts the fixed skills before alphabetical extras even when JSON keys were reordered", () => {
    const names = [
      "Zoologie",
      "Esquive (Evasion)",
      "Bagarre (Brawling)",
      "Fusils (Shoulder Arms)",
      "Pistolets (Handguns)",
      "Tir automatique (Autofire)",
      "Mêlée / CàC",
      "Art",
    ];
    expect(
      orderedSkills(
        names.map((name) => ({ name, stat: "DEX", level: 0 })),
        cp.rules.skillOrder,
      ).map((x) => x.skill.name),
    ).toEqual([
      "Pistolets (Handguns)",
      "Fusils (Shoulder Arms)",
      "Tir automatique (Autofire)",
      "Mêlée / CàC",
      "Bagarre (Brawling)",
      "Esquive (Evasion)",
      "Art",
      "Zoologie",
    ]);
  });
  it("marks exactly the five highest bases, including deterministic ties", () => {
    const skills = [0, 8, 3, 8, 1, 6, 9].map((level, index) => ({
      name: String(index),
      stat: "DEX",
      level,
    }));
    expect([...topSkillIndexes(skills, readStats({ stats: { DEX: 5 } }, cp), cp)]).toEqual([
      6, 1, 3, 5, 2,
    ]);
  });
  it("sans ordre défini : ordre alphabétique", () => {
    const names = ["Zoologie", "Art", "Équitation"];
    expect(
      orderedSkills(names.map((name) => ({ name, stat: "DEX", level: 0 }))).map(
        (x) => x.skill.name,
      ),
    ).toEqual(["Art", "Équitation", "Zoologie"]);
  });
});
