import { describe, it, expect, afterEach } from "vitest";
import { Deferred, JobCancelled, ensureActive, type Job } from "../src/job";
import { launch, setGlobalContextData, currentJobOrNull } from "../src/coroutines";

afterEach(() => {
  setGlobalContextData({});
});

describe("Deferred", () => {
  describe("complete", () => {
    it("resolves the deferred", async () => {
      const d = new Deferred<number>();
      d.complete(42);
      const result = await d.join();
      expect(result).toBeUndefined(); // join() returns void
    });

    it("removes from parent children", async () => {
      const parent = new Deferred<void>();
      const child = new Deferred<void>(parent as Job);

      expect(parent.children.has(child as Job)).toBe(true);
      child.complete(undefined);
      expect(parent.children.has(child as Job)).toBe(false);

      parent.complete(undefined);
    });

    it("no-op after settled", async () => {
      const d = new Deferred<number>();
      d.complete(1);
      d.complete(2); // should not throw
    });
  });

  describe("cancel", () => {
    it("rejects with JobCancelled", async () => {
      const d = new Deferred<void>();
      d.cancel();
      await expect(d.join()).rejects.toThrow(JobCancelled);
    });

    it("sets isCancelled", () => {
      const d = new Deferred<void>();
      expect(d.isCancelled).toBe(false);
      d.cancel();
      expect(d.isCancelled).toBe(true);
    });

    it("cancels children recursively", async () => {
      const parent = new Deferred<void>();
      const child = new Deferred<void>(parent as Job);
      const grandchild = new Deferred<void>(child as Job);

      parent.cancel();

      expect(child.isCancelled).toBe(true);
      expect(grandchild.isCancelled).toBe(true);
    });

    it("is idempotent", () => {
      const d = new Deferred<void>();
      d.cancel();
      d.cancel(); // should not throw
      expect(d.isCancelled).toBe(true);
    });

    it("no-op after complete", () => {
      const d = new Deferred<void>();
      d.complete(undefined);
      d.cancel();
      expect(d.isCancelled).toBe(false);
    });
  });

  describe("fail", () => {
    it("rejects with given error", async () => {
      const d = new Deferred<void>();
      const err = new Error("boom");
      d.fail(err);
      await expect(d.join()).rejects.toThrow("boom");
    });

    it("sets isCancelled", () => {
      const d = new Deferred<void>();
      d.fail(new Error());
      expect(d.isCancelled).toBe(true);
    });

    it("cancels children", () => {
      const parent = new Deferred<void>();
      const child = new Deferred<void>(parent as Job);

      parent.fail(new Error("oops"));
      expect(child.isCancelled).toBe(true);
    });

    it("no-op after settled", () => {
      const d = new Deferred<void>();
      d.complete(undefined);
      d.fail(new Error()); // should not throw
    });
  });

  describe("join", () => {
    it("resolves on complete", async () => {
      const d = new Deferred<void>();
      d.complete(undefined);
      await d.join(); // should not hang
    });

    it("rejects on fail", async () => {
      const d = new Deferred<void>();
      d.fail(new Error("fail"));
      await expect(d.join()).rejects.toThrow("fail");
    });

    it("waits for all descendants", async () => {
      const parent = new Deferred<void>();
      const child = new Deferred<void>(parent as Job);

      let childJoined = false;
      const joinPromise = parent.join().then(() => {
        childJoined = true;
      });

      parent.complete(undefined);

      // Parent is complete but join should still wait for child
      await Promise.resolve();
      await Promise.resolve();
      expect(childJoined).toBe(false);

      child.complete(undefined);
      await joinPromise;
      expect(childJoined).toBe(true);
    });
  });

  describe("parent-child", () => {
    it("addChild/removeChild", () => {
      const parent = new Deferred<void>();
      const child = new Deferred<void>();

      parent.addChild(child as Job);
      expect(parent.children.has(child as Job)).toBe(true);

      parent.removeChild(child as Job);
      expect(parent.children.has(child as Job)).toBe(false);
    });

    it("complete removes from parent", () => {
      const parent = new Deferred<void>();
      const child = new Deferred<void>(parent as Job);

      expect(parent.children.size).toBe(1);
      child.complete(undefined);
      expect(parent.children.size).toBe(0);

      parent.complete(undefined);
    });
  });

  describe("error propagation", () => {
    it("child failure fails non-supervisor parent", async () => {
      const deferred = launch(async () => {
        launch(async () => {
          throw new Error("child error");
        });
        // Keep parent alive so it can receive the error
        await new Promise((r) => setTimeout(r, 50));
      });

      await expect(deferred.join()).rejects.toThrow("child error");
    });

    it("JobCancelled never propagates up", async () => {
      const deferred = launch(async () => {
        const child = launch(async () => {
          await new Promise((r) => setTimeout(r, 100));
        });
        child.cancel();
        await new Promise((r) => setTimeout(r, 10));
      });

      await deferred.join(); // should not reject
    });
  });
});

describe("ensureActive", () => {
  it("no-op outside context", () => {
    ensureActive(); // should not throw
  });

  it("no-op when active", async () => {
    const deferred = launch(async () => {
      ensureActive(); // should not throw
    });
    await deferred.join();
  });

  it("throws JobCancelled when cancelled", async () => {
    let error: unknown;
    const deferred = launch(async () => {
      const job = currentJobOrNull();
      job!.cancel();
      try {
        ensureActive();
      } catch (e) {
        error = e;
      }
    });

    try { await deferred.join(); } catch {}
    expect(error).toBeInstanceOf(JobCancelled);
  });
});
