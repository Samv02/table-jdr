import { describe, expect, it } from "vitest";
import { displayName, pickActive } from "./active-character";

const a = { id: "a", name: "Kaïra", handle: "SUDO" };
const b = { id: "b", name: "Bob", handle: null };
describe("active character", () => {
  it("player with one character gets it automatically", () =>
    expect(pickActive([a], null, false)).toBe(a));
  it("keeps the stored choice", () => expect(pickActive([a, b], "b", false)).toBe(b));
  it("GM defaults to no character", () => expect(pickActive([a, b], null, true)).toBeNull());
  it("player with no character has none", () => expect(pickActive([], null, false)).toBeNull());
});
describe("roll display name", () => {
  it("uses character handle", () =>
    expect(displayName({ character: a, isGm: false, username: "x" })).toBe("SUDO"));
  it("GM without character is MJ", () =>
    expect(displayName({ character: null, isGm: true, username: "mj" })).toBe("MJ"));
  it("player without character uses pseudo", () =>
    expect(displayName({ character: null, isGm: false, username: "Runner-AB12" })).toBe(
      "Runner-AB12",
    ));
});
