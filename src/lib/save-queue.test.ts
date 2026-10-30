import { describe, expect, it } from "vitest";
import { createSaveQueue } from "./save-queue";

describe("state save queue", () => {
  it("waits for every pending sheet change before confirming the save", async () => {
    const queue = createSaveQueue();
    let release = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    let saved = false;
    const first = queue.enqueue(async () => {
      await slow;
    });
    const second = queue.enqueue(async () => {
      saved = true;
    });
    let confirmed = false;
    const confirmation = queue.flush().then(() => {
      confirmed = true;
    });
    await Promise.resolve();
    expect(confirmed).toBe(false);
    release();
    await Promise.all([first, second, confirmation]);
    expect(saved).toBe(true);
    expect(confirmed).toBe(true);
    expect(queue.pending).toBe(false);
  });
  it("keeps newer loose-ammo changes behind a slow older save", async () => {
    const queue = createSaveQueue();
    let release = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    let stored = 0;
    const first = queue.enqueue(async () => {
      await slow;
      stored = 1;
    });
    const second = queue.enqueue(async () => {
      stored = 2;
    });
    await Promise.resolve();
    expect(stored).toBe(0);
    expect(queue.pending).toBe(true);
    release();
    await Promise.all([first, second]);
    expect(stored).toBe(2);
  });

  it("continues saving after a failed request", async () => {
    const queue = createSaveQueue();
    const failed = queue.enqueue(async () => {
      throw new Error("offline");
    });
    const next = queue.enqueue(async () => 3);
    await expect(failed).rejects.toThrow("offline");
    await expect(next).resolves.toBe(3);
  });
});
