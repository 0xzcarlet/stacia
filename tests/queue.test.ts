import { expect, it, vi } from "vitest";
import { JobQueue } from "../src/queue.js";
it("bounds waiting jobs and expires waiting work", async () => {
  vi.useFakeTimers();
  try {
    const queue = new JobQueue(1, 100);
    let finish!: () => void;
    const active = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const expire = vi.fn();
    queue.push(() => active, vi.fn());
    queue.push(async () => {}, expire);
    expect(queue.hasCapacity).toBe(false);
    expect(() => queue.push(async () => {}, vi.fn())).toThrow("Antrean penuh");
    await vi.advanceTimersByTimeAsync(101);
    expect(expire).toHaveBeenCalledOnce();
    finish();
    await queue.stop();
    expect(queue.hasCapacity).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
