import { describe, it, expect } from "vitest";
import { Semaphore } from "../src/semaphore";

describe("Semaphore", () => {
  it("acquire resolves immediately when permits available", async () => {
    const sem = new Semaphore(1);
    await sem.acquire(); // should not hang
  });

  it("acquire blocks when no permits available", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    let acquired = false;
    const pending = sem.acquire().then(() => {
      acquired = true;
    });

    // Give microtasks a chance to flush
    await Promise.resolve();
    expect(acquired).toBe(false);

    sem.release();
    await pending;
    expect(acquired).toBe(true);
  });

  it("release wakes next waiter in FIFO order", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    const order: number[] = [];

    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));

    sem.release();
    await p1;
    sem.release();
    await p2;

    expect(order).toEqual([1, 2]);
  });

  it("multiple acquires exhaust permits", async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();

    let acquired = false;
    const pending = sem.acquire().then(() => {
      acquired = true;
    });

    await Promise.resolve();
    expect(acquired).toBe(false);

    sem.release();
    await pending;
    expect(acquired).toBe(true);
  });

  it("works with maxPermits > 1", async () => {
    const sem = new Semaphore(3);
    await sem.acquire();
    await sem.acquire();
    await sem.acquire();

    let acquired = false;
    const pending = sem.acquire().then(() => {
      acquired = true;
    });

    await Promise.resolve();
    expect(acquired).toBe(false);

    sem.release();
    await pending;
    expect(acquired).toBe(true);
  });

  it("release without prior acquire increases permits beyond initial count", async () => {
    const sem = new Semaphore(1);
    sem.release(); // now 2 permits
    await sem.acquire();
    await sem.acquire(); // should still work because of extra release
  });
});
