import { describe, expect, it } from "vitest";
import {
  foldersOf,
  musicForScene,
  nameFromFile,
  readAmbiance,
  readSceneMusic,
  readTransition,
  reorder,
  sortChanges,
} from "./scenes";

const list = [
  { id: "a", sort_order: 0 },
  { id: "b", sort_order: 1 },
  { id: "c", sort_order: 2 },
  { id: "d", sort_order: 3 },
];

describe("scènes", () => {
  it("glisser une scène change l'ordre, et seules les positions changées s'écrivent", () => {
    const next = reorder(list, "d", "b");
    expect(next.map((x) => x.id)).toEqual(["a", "d", "b", "c"]);
    expect(sortChanges(next)).toEqual([
      { id: "d", sort_order: 1 },
      { id: "b", sort_order: 2 },
      { id: "c", sort_order: 3 },
    ]);
    expect(reorder(list, "a", "a")).toBe(list);
    expect(reorder(list, "x", "a")).toBe(list);
  });

  it("un nom de fichier devient un nom lisible", () => {
    expect(nameFromFile("foret_sombre-02.jpg")).toBe("Foret sombre 02");
    expect(nameFromFile(".png")).toBe("Nouvelle scène");
  });

  it("dossiers utilisés, sans doublon ni vide", () => {
    expect(
      foldersOf([
        { folder: "Acte 2" },
        { folder: "" },
        { folder: "Acte 1" },
        { folder: "Acte 2 " },
      ]),
    ).toEqual(["Acte 1", "Acte 2"]);
  });

  it("transition, ambiance et musique illisibles reprennent une valeur sûre", () => {
    expect(readTransition("tourbillon")).toBe("fade");
    expect(readTransition("zoom")).toBe("zoom");
    expect(readAmbiance("rain")).toBe("rain");
    expect(readAmbiance("lave")).toBe("none");
    expect(readSceneMusic({ video_id: "pas bon" })).toBeNull();
    expect(readSceneMusic({ video_id: "dQw4w9WgXcQ", title: "Thème" })).toEqual({
      video_id: "dQw4w9WgXcQ",
      title: "Thème",
    });
  });

  it("la musique liée se joue depuis le début, dans la file ou ajoutée à la fin", () => {
    const current = {
      source_type: "video" as const,
      source_id: "aaaaaaaaaaa",
      index: 0,
      is_playing: false,
      position_sec: 42,
      volume: 60,
      queue: [
        { video_id: "aaaaaaaaaaa", title: "A", duration: 100 },
        { video_id: "bbbbbbbbbbb", title: "B", duration: 100 },
      ],
      fade: { from: 0, to: 1, dur: 1000 },
    };
    const inQueue = musicForScene(current, { video_id: "bbbbbbbbbbb", title: "B" });
    expect(inQueue).toMatchObject({
      source_id: "bbbbbbbbbbb",
      index: 1,
      is_playing: true,
      position_sec: 0,
      volume: 60,
    });
    expect(inQueue.fade).toBeUndefined();
    const added = musicForScene(current, { video_id: "ccccccccccc", title: "C" });
    expect(added.index).toBe(2);
    expect(added.queue?.[2]).toMatchObject({ video_id: "ccccccccccc", title: "C" });
  });
});
