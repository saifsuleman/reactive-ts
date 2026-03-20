import { describe, it, expect, afterEach } from "vitest";
import { ReentrantLock } from "../src/reentrant-lock";
import { launch, setGlobalContextData } from "../src/coroutines";
import { delay } from "../src/delay";

afterEach(() => {
  setGlobalContextData({});
});

describe("ReentrantLock", () => {
  it("lock/unlock within coroutine", async () => {
    const lock = new ReentrantLock();
    const deferred = launch(async () => {
      await lock.lock();
      lock.unlock();
    });
    await deferred.join();
  });

  it("reentrant — same coroutine locks multiple times without deadlock", async () => {
    const lock = new ReentrantLock();
    const deferred = launch(async () => {
      await lock.lock();
      await lock.lock();
      await lock.lock();
      lock.unlock();
      lock.unlock();
      lock.unlock();
    });
    await deferred.join();
  });

  it("unlock without lock throws 'lock not owned by this coroutine'", async () => {
    const lock = new ReentrantLock();
    let error: unknown;
    const deferred = launch(async () => {
      try {
        lock.unlock();
      } catch (e) {
        error = e;
      }
    });
    await deferred.join();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("lock not owned by this coroutine");
  });

  it("mutual exclusion between different coroutines", async () => {
    const lock = new ReentrantLock();
    const events: string[] = [];

    const deferred = launch(async () => {
      const a = launch(async () => {
        await lock.lock();
        events.push("a-enter");
        await delay(30);
        events.push("a-exit");
        lock.unlock();
      });

      const b = launch(async () => {
        // Small delay so 'a' acquires first
        await delay(5);
        await lock.lock();
        events.push("b-enter");
        await delay(10);
        events.push("b-exit");
        lock.unlock();
      });

      await a.join();
      await b.join();
    });

    await deferred.join();

    // b should not enter until a exits
    const aExit = events.indexOf("a-exit");
    const bEnter = events.indexOf("b-enter");
    expect(aExit).toBeLessThan(bEnter);
    expect(events).toEqual(["a-enter", "a-exit", "b-enter", "b-exit"]);
  });

  it("partial unlock doesn't release semaphore; full unlock does", async () => {
    const lock = new ReentrantLock();
    const events: string[] = [];

    const deferred = launch(async () => {
      const a = launch(async () => {
        await lock.lock();
        await lock.lock();
        events.push("a-locked-twice");
        lock.unlock(); // still holds lock (count = 1)
        events.push("a-partial-unlock");
        await delay(20);
        lock.unlock(); // fully released
        events.push("a-full-unlock");
      });

      const b = launch(async () => {
        await delay(5); // ensure a locks first
        await lock.lock();
        events.push("b-locked");
        lock.unlock();
      });

      await a.join();
      await b.join();
    });

    await deferred.join();

    // b should only lock after a's full unlock
    const aFullUnlock = events.indexOf("a-full-unlock");
    const bLocked = events.indexOf("b-locked");
    expect(aFullUnlock).toBeLessThan(bLocked);
  });

  it("throws outside coroutine context", () => {
    const lock = new ReentrantLock();
    expect(() => lock.unlock()).toThrow("No coroutine context found");
  });
});
