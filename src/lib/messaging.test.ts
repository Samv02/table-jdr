import { describe, expect, it } from "vitest";
import {
  conversationsFor,
  gmChannel,
  holoChannel,
  isLinked,
  parseChannel,
  unreadCount,
  allPairs,
  type Message,
} from "./messaging";

const A = "11111111-1111-1111-1111-111111111111",
  B = "22222222-2222-2222-2222-222222222222",
  C = "33333333-3333-3333-3333-333333333333";
const members = [
  { character_id: A, handle: "SUDO" },
  { character_id: B, handle: "K." },
  { character_id: C, handle: "dexter" },
];
const msg = (channel: string, sender: string, at: string): Message => ({
  id: at,
  channel,
  sender_user: sender,
  sender_character: null,
  sender_name: "x",
  body: "…",
  created_at: at,
});

describe("Holo-Net", () => {
  it("un seul canal par paire, quel que soit l'ordre", () => {
    expect(holoChannel(B, A)).toBe(holoChannel(A, B));
    expect(parseChannel(holoChannel(A, B))).toEqual({ kind: "holo", ids: [A, B] });
    expect(parseChannel("n'importe quoi")).toBeNull();
  });
  it("joueur : annonces (lecture), MJ (toujours), Holo-Calls selon l'autorisation", () => {
    const c = conversationsFor({
      isGm: false,
      myCharacter: A,
      members,
      links: [{ a: A, b: B }],
      messages: [],
    });
    expect(c.map((x) => [x.title, x.canPost])).toEqual([
      ["Annonces", false],
      ["MJ", true],
      ["K.", true],
      ["dexter", false],
    ]);
    expect(c.find((x) => x.title === "MJ")!.channel).toBe(gmChannel(A));
  });
  it("MJ : annonces, tous les canaux privés et tous les Holo-Calls (même coupés s'il y a un historique)", () => {
    const c = conversationsFor({
      isGm: true,
      myCharacter: null,
      members,
      links: [{ a: A, b: B }],
      messages: [msg(holoChannel(A, C), "p1", "1")],
    });
    expect(c.every((x) => x.canPost)).toBe(true);
    expect(c.filter((x) => x.kind === "gm")).toHaveLength(3);
    expect(c.filter((x) => x.kind === "holo").map((x) => [x.title, x.allowed])).toEqual([
      ["SUDO ↔ K.", true],
      ["SUDO ↔ dexter", false],
    ]);
  });
  it("non-lus : ignore ses propres messages et ceux déjà lus", () => {
    const list = [
      msg("all", "mj", "2026-01-01T10:00"),
      msg("all", "me", "2026-01-01T10:01"),
      msg("all", "mj", "2026-01-01T10:02"),
    ];
    expect(unreadCount(list, "all", undefined, "me")).toBe(2);
    expect(unreadCount(list, "all", "2026-01-01T10:00", "me")).toBe(1);
  });
  it("paires d'autorisations", () => {
    expect(allPairs(members)).toHaveLength(3);
    expect(isLinked([{ a: A, b: B }], B, A)).toBe(true);
  });
});
