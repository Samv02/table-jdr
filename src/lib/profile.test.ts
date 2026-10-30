import { describe, expect, it } from "vitest";
import { validateAvatar, validateUsername } from "./profile";

describe("username", () => {
  it("rejects under 3 chars", () => expect(validateUsername("ab")).not.toBeNull());
  it("rejects over 20 chars", () => expect(validateUsername("a".repeat(21))).not.toBeNull());
  it("accepts 3 and 20 chars", () => {
    expect(validateUsername("abc")).toBeNull();
    expect(validateUsername("a".repeat(20))).toBeNull();
  });
});
describe("avatar", () => {
  it("rejects over 10 MB", () =>
    expect(validateAvatar({ size: 10 * 1024 * 1024 + 1, type: "image/png" })).not.toBeNull());
  it("accepts 10 MB image", () =>
    expect(validateAvatar({ size: 10 * 1024 * 1024, type: "image/png" })).toBeNull());
  it("rejects non-image", () =>
    expect(validateAvatar({ size: 10, type: "text/plain" })).not.toBeNull());
});
