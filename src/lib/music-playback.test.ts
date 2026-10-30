import { describe, expect, it } from "vitest";
import {
  contextIndexes,
  markBroken,
  playlistToLibrary,
  fadeActive,
  gmVolumeAt,
  insertTracks,
  moveTrack,
  musicMetadataUpdate,
  nextIndex,
  pickByTag,
  rebaseFade,
  removeTrack,
} from "./music-playback";
const music = {
  source_type: "video" as const,
  source_id: "track",
  is_playing: true,
  position_sec: 60,
  started_at: "2026-10-28T00:00:00Z",
  queue: [{ video_id: "track", title: "Track", duration: 300 }],
};
describe("music metadata reload", () => {
  it("starts a genuinely new playlist track at its own position", () => {
    const next = musicMetadataUpdate(
      { ...music, source_type: "playlist", source_id: "list" },
      { video_id: "next", title: "Next" },
      240,
      Date.parse("2026-10-28T00:02:00Z"),
      { ids: ["track", "next"], index: 1, position: 3 },
    );
    expect(next?.position_sec).toBe(3);
    expect(next?.index).toBe(1);
  });
  it("does not write shared music when the GM reloads existing metadata", () => {
    expect(
      musicMetadataUpdate(
        music,
        { video_id: "track", title: "Track" },
        300,
        Date.parse("2026-10-28T00:02:00Z"),
      ),
    ).toBeNull();
  });
  it("keeps server-clock progress instead of restarting when metadata first loads", () => {
    const update = musicMetadataUpdate(
      { ...music, queue: [] },
      { video_id: "track", title: "Track" },
      300,
      Date.parse("2026-10-28T00:02:00Z"),
    );
    expect(update?.position_sec).toBe(180);
    expect(update?.is_playing).toBe(true);
  });
  it("ignores callbacks for stale tracks", () => {
    expect(musicMetadataUpdate(music, { video_id: "previous", title: "Old" }, 300, 0)).toBeNull();
  });
});

const T = (id: string, tag?: string) => ({ video_id: id, title: id, duration: 100, tag });
const q = {
  source_type: "video" as const,
  source_id: "b",
  index: 1,
  queue: [T("a", "Combat"), T("b"), T("c", "Combat"), T("d")],
};

describe("fondus partagés", () => {
  const start = "2026-10-28T00:00:00Z",
    t0 = Date.parse(start);
  const m = { volume: 80, started_at: start, fade: { from: 0, to: 80, dur: 4000 } };
  it("interpole le volume pendant le fondu puis garde la cible", () => {
    expect(gmVolumeAt(m, t0)).toBe(0);
    expect(gmVolumeAt(m, t0 + 2000)).toBe(40);
    expect(gmVolumeAt(m, t0 + 9000)).toBe(80);
    expect(fadeActive(m, t0 + 1000)).toBe(true);
    expect(fadeActive(m, t0 + 5000)).toBe(false);
  });
  it("sans fondu : volume du MJ", () => expect(gmVolumeAt({ volume: 35 }, 0)).toBe(35));
  it("une écriture sans rapport ne redémarre pas le fondu", () => {
    const next = rebaseFade(m, { ...m, is_playing: false }, t0 + 1000);
    expect(next.fade).toEqual({ from: 20, to: 80, dur: 3000 });
  });
  it("un fondu terminé et revenu au volume normal est supprimé", () => {
    expect(rebaseFade(m, { ...m }, t0 + 5000).fade).toBeUndefined();
  });
  it("un volume baissé (voix) reste baissé après d'autres écritures", () => {
    const duck = {
      volume: 80,
      started_at: start,
      fade: { from: 80, to: 24, dur: 800 },
      duck: true,
    };
    expect(rebaseFade(duck, { ...duck }, t0 + 5000).fade).toEqual({ from: 24, to: 24, dur: 0 });
  });
  it("un nouveau fondu explicite est conservé", () => {
    const f = { from: 50, to: 0, dur: 2000 };
    expect(rebaseFade(m, { ...m, fade: f }, t0).fade).toBe(f);
  });
});

describe("enchaînement", () => {
  it("piste suivante / précédente sans boucle", () => {
    expect(nextIndex(q)).toBe(2);
    expect(nextIndex(q, { dir: -1 })).toBe(0);
    expect(nextIndex({ ...q, index: 3 })).toBeNull();
  });
  it("boucle sur toute la file", () => {
    expect(nextIndex({ ...q, index: 3, loop: "all" })).toBe(0);
    expect(nextIndex({ ...q, index: 0, loop: "all" }, { dir: -1 })).toBe(3);
  });
  it("boucle sur une piste : seulement en fin naturelle", () => {
    expect(nextIndex({ ...q, loop: "one" }, { auto: true })).toBe(1);
    expect(nextIndex({ ...q, loop: "one" })).toBe(2);
  });
  it("aléatoire : jamais la même piste", () => {
    const seq = [0.3, 0.3, 0.9];
    let k = 0;
    expect(nextIndex({ ...q, shuffle: true }, { rand: () => seq[k++]! })).toBe(3);
  });
  it("ambiance : une piste au hasard avec ce tag", () => {
    expect([0, 2]).toContain(pickByTag(q, "Combat"));
    expect(pickByTag(q, "Bar")).toBeNull();
  });
});

describe("édition de la file", () => {
  it("déplacer garde la piste en cours", () => {
    const m = moveTrack(q, 1, 3);
    expect(m.queue!.map((t) => t.video_id)).toEqual(["a", "c", "d", "b"]);
    expect(m.index).toBe(3);
    expect(moveTrack(q, 3, 0).index).toBe(2);
  });
  it("supprimer avant la piste en cours décale l'index ; la piste en cours est protégée", () => {
    expect(removeTrack(q, 0).index).toBe(0);
    expect(removeTrack(q, 1)).toBe(q);
  });
  it("insérer à la suite ou à la fin, sans doublon", () => {
    expect(insertTracks(q, [T("x")], "next").queue!.map((t) => t.video_id)).toEqual([
      "a",
      "b",
      "x",
      "c",
      "d",
    ]);
    expect(insertTracks(q, [T("x"), T("a")], "end").queue!.map((t) => t.video_id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "x",
    ]);
  });
});

describe("ambiances et fin de piste", () => {
  const lib = {
    source_type: "video" as const,
    source_id: "b",
    index: 1,
    queue: [T("a", "Combat"), T("b", "Combat"), T("c", "Calme"), T("d", "Combat")],
  };
  it("Arrêter : la musique s'arrête à la fin de la piste", () => {
    expect(nextIndex({ ...lib, loop: "off" }, { auto: true })).toBeNull();
  });
  it("Enchaîner : reste dans l'ambiance en cours et boucle", () => {
    const m = { ...lib, loop: "all" as const, context: "Combat" };
    expect(nextIndex(m, { auto: true })).toBe(3);
    expect(nextIndex({ ...m, index: 3 }, { auto: true })).toBe(0);
  });
  it("une piste indisponible est sautée", () => {
    const m = markBroken({ ...lib, loop: "all" as const, context: "Combat" }, "d");
    expect(contextIndexes(m)).toEqual([0, 1]);
    expect(nextIndex(m, { auto: true })).toBe(0);
  });
  it("Lire ensuite passe avant l'ordre normal", () => {
    expect(nextIndex({ ...lib, loop: "all", next_up: "c" }, { auto: true })).toBe(2);
  });
  it("une playlist YouTube devient une bibliothèque modifiable", () => {
    const m = playlistToLibrary({
      source_type: "playlist",
      source_id: "PL1",
      index: 2,
      queue: [T("a"), T("b"), T("c")],
    });
    expect(m.source_type).toBe("video");
    expect(m.source_id).toBe("c");
  });
});
