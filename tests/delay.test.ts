import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { delay } from "../src/delay";

describe("delay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after specified time", async () => {
    let resolved = false;
    const p = delay(1000).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);

    await p;
  });

  it("resolves with undefined", async () => {
    const p = delay(100);
    await vi.advanceTimersByTimeAsync(100);
    const result = await p;
    expect(result).toBeUndefined();
  });
});
