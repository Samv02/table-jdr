import { addSkills, ammoOf, hpAfter, hpFill, hpLimit, hpShown, missingSkills } from "./sheet";
import { describe, expect, it } from "vitest";
import {
  ammoStatus,
  ammoTotal,
  hpMax,
  hpStatus,
  parseDamage,
  readSkills,
  readStats,
  readWeapons,
  reload,
  packMagazine,
  shoot,
  skillBase,
  weaponSkill,
  writeSkills,
} from "./sheet";
import { gaugeMax, presetById, woundedFor } from "./universe";

const cp = presetById("cyberpunk");

const stats = readStats(
  {
    stats: { INT: 8, REF: 7, DEX: 6, TECH: 5, COOL: 4, WILL: 6, LUCK: 3, MOVE: 5, BODY: 8, EMP: 5 },
  },
  cp,
);

describe("stats", () => {
  it("accepte les variantes de clés fr/en", () => {
    expect(stats["CORPS"]).toBe(8);
    expect(stats["VOL"]).toBe(6);
    expect(stats["REF"]).toBe(7);
    expect(stats["PRE"]).toBe(4);
    expect(stats["CHANCE"]).toBe(3);
  });
});

describe("calculs", () => {
  it("saves custom skill titles without changing weapon skill identities or levels", () => {
    for (const sheet of [
      { skills: { Pistolets: { stat: "REF", val: 6 } } },
      { skills: [{ name: "Pistolets", stat: "REF", level: 6 }] },
    ]) {
      const original = readSkills(sheet);
      const changed = original.map((skill) => ({ ...skill, title: "Armes de poing" }));
      const reread = readSkills({ skills: writeSkills(sheet, changed) });
      expect(reread).toEqual([
        { name: "Pistolets", title: "Armes de poing", stat: "REF", level: 6 },
      ]);
      expect(skillBase(reread[0] ?? { name: "", stat: "", level: 0 }, stats, cp)).toBe(13);
    }
  });
  it("titre de compétence : les espaces entre les mots survivent, l'espace final est retiré à l'écriture", () => {
    const sheet = { skills: { Pistolets: { stat: "REF", val: 6 } } };
    const write = (title: string) =>
      readSkills({
        skills: writeSkills(sheet, [{ name: "Pistolets", stat: "REF", level: 6, title }]),
      });
    // Un titre avec des espaces internes doit être relu tel quel.
    expect(write("Tir de précision")[0]?.title).toBe("Tir de précision");
    // L'espace tapé en fin de mot est retiré au stockage : la saisie doit donc
    // afficher le texte brut, sinon le mot suivant collerait au précédent.
    expect(write("Tir de précision ")[0]?.title).toBe("Tir de précision");
  });
  it("PV max = 10 + 5 × arrondi sup((CORPS + VOL) / 2)", () => {
    expect(hpMax(readStats({ stats: { CORPS: 8, VOL: 6 } }, cp), {}, cp)).toBe(45); // (8+6)/2 = 7 → 10 + 35
    expect(hpMax(readStats({ stats: { CORPS: 5, VOL: 4 } }, cp), {}, cp)).toBe(35); // 4.5 → 5 → 10 + 25
  });
  it("gravement blessé ≤ arrondi sup(PV max / 2)", () => {
    const w = woundedFor(cp, 45, stats, {});
    expect(w).toBe(23);
    expect(hpStatus(23, w)).toBe("blesse");
    expect(hpStatus(24, w)).toBe("ok");
    expect(hpStatus(0, w)).toBe("mourant");
    // Univers sans seuil de blessure grave
    expect(hpStatus(1, null)).toBe("ok");
  });
  it("Humanité max = EMP × 10", () => {
    expect(gaugeMax(cp, cp.rules.gauges[0]!, stats, {})).toBe(50);
  });
  it("base compétence = stat + niveau", () => {
    const sk = readSkills({ skills: [{ name: "Pistolets", stat: "REF", level: 3 }] })[0]!;
    expect(skillBase(sk, stats, cp)).toBe(10);
  });
  it("compétences en forme objet { nom: { stat, val } }", () => {
    const sk = readSkills({
      skills: {
        "Pistolets (Handguns)": { stat: "REF", val: 6 },
        Négociation: { stat: "PRE", val: 5 },
      },
    });
    expect(sk).toHaveLength(2);
    expect(sk[0]).toEqual({ name: "Pistolets (Handguns)", stat: "REF", level: 6 });
    expect(skillBase(sk[0]!, stats, cp)).toBe(13); // REF 7 + 6
    expect(skillBase(sk[1]!, stats, cp)).toBe(9); // PRE (COOL) 4 + 5
  });
  it("writeSkills conserve la forme objet d'origine", () => {
    const sheet = { skills: { Pistolets: { stat: "REF", val: 6 } } };
    expect(
      writeSkills(sheet, [
        { name: "Pistolets", stat: "REF", level: 7 },
        { name: "Athlétisme", stat: "DEX", level: 2 },
      ]),
    ).toEqual({
      Pistolets: { stat: "REF", val: 7 },
      Athlétisme: { stat: "DEX", val: 2 },
    });
    expect(writeSkills({ skills: [] }, [{ name: "Pistolets", stat: "REF", level: 7 }])).toEqual([
      { name: "Pistolets", stat: "REF", level: 7 },
    ]);
  });
});

describe("armes", () => {
  const weapons = readWeapons({
    weapons: [
      { name: "Pistolet moyen", dmg: "2d6", ammo: " 12 ", rof: 2 },
      { name: "Fusil d'assaut", dmg: "5d6", ammo: "25", skill: "" },
      { name: "Couteau", dmg: "1d6", ammo: "" },
    ],
  });
  it("nettoie ammo (trim) et déduit la capacité", () => {
    expect(weapons[0]!.capacity).toBe(12);
    expect(weapons[2]!.capacity).toBe(0);
  });
  it("déduit la compétence du nom quand skill est vide", () => {
    expect(weaponSkill(weapons[0]!)).toBe("Pistolets");
    expect(weaponSkill(weapons[1]!)).toBe("Fusils");
    expect(weaponSkill(weapons[2]!)).toBe("Mêlée / CàC");
  });
  it("skill explicite prioritaire", () => {
    expect(weaponSkill({ ...weapons[0]!, skill: "Armes lourdes" })).toBe("Armes lourdes");
  });
  it("parse les dégâts", () => {
    expect(parseDamage("2d6+3")).toEqual({ count: 2, sides: 6, mod: 3 });
    expect(parseDamage("5d6")).toEqual({ count: 5, sides: 6, mod: 0 });
    expect(parseDamage("—")).toBeNull();
  });
});

describe("munitions", () => {
  it("forms a spare magazine from exactly its capacity in loose rounds", () => {
    const before = { mag: 8, spare: 2, loose: 42 };
    const after = packMagazine(before, 30);
    expect(after).toEqual({ mag: 8, spare: 3, loose: 12 });
    expect(ammoTotal(after, 30)).toBe(ammoTotal(before, 30));
  });
  it("does not create a magazine with insufficient loose rounds", () => {
    expect(packMagazine({ mag: 30, spare: 2, loose: 29 }, 30)).toEqual({
      mag: 30,
      spare: 2,
      loose: 29,
    });
    expect(packMagazine({ mag: 0, spare: 0, loose: 42 }, 0)).toEqual({
      mag: 0,
      spare: 0,
      loose: 42,
    });
  });
  const weapons = readWeapons({
    weapons: [
      { name: "P", ammo: "12" },
      { name: "C", ammo: "" },
    ],
  });
  it("statut OK / BAS / VIDE", () => {
    expect(ammoStatus(12, 12)).toBe("OK");
    expect(ammoStatus(3, 12)).toBe("BAS");
    expect(ammoStatus(0, 12)).toBe("VIDE");
  });
  it("tir ne descend pas sous 0", () => {
    expect(shoot({ mag: 1, spare: 0, loose: 0 }, 10).mag).toBe(0);
  });
  it("recharger utilise un chargeur plein en priorité et conserve les balles restantes", () => {
    const before = { mag: 10, spare: 1, loose: 5 };
    const after = reload(before, 12);
    expect(after).toEqual({ mag: 12, spare: 0, loose: 15 });
    expect(ammoTotal(after, 12)).toBe(ammoTotal(before, 12));
  });
  it("sans chargeur plein, recharger utilise seulement le vrac disponible", () => {
    expect(reload({ mag: 10, spare: 0, loose: 5 }, 12)).toEqual({ mag: 12, spare: 0, loose: 3 });
    expect(reload({ mag: 10, spare: 0, loose: 1 }, 12)).toEqual({ mag: 11, spare: 0, loose: 0 });
    expect(reload({ mag: 10, spare: 0, loose: 0 }, 12)).toEqual({ mag: 10, spare: 0, loose: 0 });
  });
  it("total disponible = chargeur + recharges × capacité + vrac", () => {
    expect(ammoTotal({ mag: 5, spare: 2, loose: 7 }, 12)).toBe(36);
  });
});

import { newSkillName, statKey as key, statLabel, writeStat } from "./sheet";
describe("compétences créées par le MJ", () => {
  it("chaque caractéristique de l'univers est relue à l'identique (clé, libellé, alias)", () => {
    for (const st of cp.rules.stats) {
      expect(key(st.key, cp)).toBe(st.key);
      expect(key(st.label, cp)).toBe(st.key);
    }
    expect(key("ADR", cp)).toBe("DEX");
    expect(key("FROID", cp)).toBe("PRE");
    expect(statLabel("PRE", cp)).toBe("PRÉ");
    expect(key("XYZ", cp)).toBeNull();
  });
  it("écrire une caractéristique garde la clé d'origine du JSON", () => {
    expect(writeStat({ stats: { BODY: 8 } }, "CORPS", 9, cp)).toEqual({ BODY: 9 });
    expect(writeStat({}, "CORPS", 9, cp)).toEqual({ CORPS: 9 });
  });
  it("deux nouvelles compétences ne s'écrasent pas", () => {
    expect(newSkillName([])).toBe("Nouvelle compétence");
    expect(newSkillName([{ name: "Nouvelle compétence" }])).toBe("Nouvelle compétence 2");
    expect(newSkillName([{ name: "Nouvelle compétence" }, { name: "Nouvelle compétence 2" }])).toBe(
      "Nouvelle compétence 3",
    );
  });
});

describe("skill library on a sheet", () => {
  const library = [
    { name: "Écouter", stat: "INT", level: 20 },
    { name: "Esquive", stat: "DEX", level: 20 },
  ];
  it("ignores accents and case when looking for what is missing", () => {
    expect(missingSkills(library, [{ name: "ecouter" }]).map((s) => s.name)).toEqual(["Esquive"]);
  });
  it("never adds the same skill twice", () => {
    const once = addSkills([], library);
    expect(addSkills(once, library)).toHaveLength(2);
    expect(once[0]).toMatchObject({ name: "Écouter", stat: "INT", level: 20 });
  });
});

describe("HP never depend on a computed maximum being known", () => {
  it("keeps the usual limits when the maximum is known", () => {
    expect(hpAfter(18, 5, 20)).toBe(20);
    expect(hpAfter(3, -5, 20)).toBe(0);
    expect(hpShown(25, 20)).toBe(20);
  });
  it("keeps and changes HP freely when the maximum is unknown", () => {
    expect(hpShown(16, 0)).toBe(16);
    expect(hpAfter(16, 5, 0)).toBe(21);
    expect(hpAfter(0, 5, 0)).toBe(5);
    expect(hpAfter(16, -20, 0)).toBe(0);
  });
});

describe("HP bars read the data and never fail on a missing maximum", () => {
  it("fills the bar from the stored value", () => {
    expect(hpFill(10, 20)).toBe(0.5);
    expect(hpFill(25, 20)).toBe(1);
    expect(hpFill(16, 0)).toBe(1);
    expect(hpFill(0, 0)).toBe(0);
    expect(hpLimit(0)).toBe("?");
  });
  it("reads a new weapon as full without storing anything", () => {
    const stored = {};
    expect(ammoOf(stored, 0, 12)).toEqual({ mag: 12, spare: 2, loose: 0 });
    expect(stored).toEqual({});
  });
});
