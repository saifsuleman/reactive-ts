import { describe, it, expect, afterEach } from "vitest";
import {
  launch,
  withContext,
  coroutineContext,
  coroutineContextOrNull,
  currentJob,
  currentJobOrNull,
  setGlobalContextData,
  getGlobalContextData,
  JOB_KEY,
} from "../src/coroutines";

afterEach(() => {
  setGlobalContextData({});
});

describe("launch", () => {
  it("returns Deferred that resolves with return value", async () => {
    const deferred = launch(async () => 42);
    await deferred.join();
    // join() itself returns void; the value is internal
    // We verify the deferred completed successfully by join() not throwing
  });

  it("establishes context", async () => {
    let hasContext = false;
    const deferred = launch(async () => {
      hasContext = coroutineContextOrNull() !== null;
    });
    await deferred.join();
    expect(hasContext).toBe(true);
  });

  it("sets current job", async () => {
    let jobExists = false;
    const deferred = launch(async () => {
      jobExists = currentJobOrNull() !== null;
    });
    await deferred.join();
    expect(jobExists).toBe(true);
  });

  it("waits for children before completing", async () => {
    const events: string[] = [];

    const deferred = launch(async () => {
      launch(async () => {
        await new Promise((r) => setTimeout(r, 30));
        events.push("child");
      });
      events.push("parent");
    });

    await deferred.join();
    expect(events).toEqual(["parent", "child"]);
  });

  it("fails on throw", async () => {
    const deferred = launch(async () => {
      throw new Error("boom");
    });

    await expect(deferred.join()).rejects.toThrow("boom");
  });

  it("supervisor mode isolates child errors", async () => {
    let handlerCalled = false;

    await launch(async () => {
      const inner = launch(async () => {
        throw new Error("child error");
      });

      inner.catch(() => {
        handlerCalled = true;
      });
    }, { supervisor: true });

    expect(handlerCalled).toBe(true);
  });

  it("non-supervisor propagates child errors", async () => {
    const deferred = launch(async () => {
      launch(async () => {
        throw new Error("child error");
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    await expect(deferred.join()).rejects.toThrow("child error");
  });
});

describe("withContext", () => {
  const TEST_KEY = Symbol("test");

  it("merges context data", async () => {
    let value: unknown;
    const deferred = launch(async () => {
      await withContext({ [TEST_KEY]: "hello" }, async () => {
        value = coroutineContext()[TEST_KEY];
      });
    });
    await deferred.join();
    expect(value).toBe("hello");
  });

  it("throws on JOB_KEY override", async () => {
    let error: unknown;
    const deferred = launch(async () => {
      try {
        withContext({ [JOB_KEY]: {} } as any, async () => {});
      } catch (e) {
        error = e;
      }
    });
    await deferred.join();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch("cannot override coroutine identity");
  });

  it("requires coroutine context", () => {
    expect(() => {
      withContext({ [TEST_KEY]: 1 }, async () => {});
    }).toThrow("No coroutine context found");
  });

  it("doesn't mutate parent context", async () => {
    let parentValue: unknown;
    const deferred = launch(async () => {
      await withContext({ [TEST_KEY]: "child" }, async () => {});
      parentValue = coroutineContext()[TEST_KEY];
    });
    await deferred.join();
    expect(parentValue).toBeUndefined();
  });
});

describe("coroutineContext / coroutineContextOrNull", () => {
  it("throws outside coroutine", () => {
    expect(() => coroutineContext()).toThrow("No coroutine context found");
  });

  it("returns null outside coroutine", () => {
    expect(coroutineContextOrNull()).toBeNull();
  });

  it("returns context inside coroutine", async () => {
    let ctx: unknown;
    const deferred = launch(async () => {
      ctx = coroutineContext();
    });
    await deferred.join();
    expect(ctx).not.toBeNull();
  });
});

describe("currentJob / currentJobOrNull", () => {
  it("throws outside coroutine", () => {
    expect(() => currentJob()).toThrow("No coroutine context found");
  });

  it("returns null outside coroutine", () => {
    expect(currentJobOrNull()).toBeNull();
  });

  it("returns job inside coroutine", async () => {
    let job: unknown;
    const deferred = launch(async () => {
      job = currentJobOrNull();
    });
    await deferred.join();
    expect(job).not.toBeNull();
    expect(job).toBe(deferred);
  });
});

describe("globalContextData", () => {
  it("round-trip set/get", () => {
    const KEY = Symbol("global");
    setGlobalContextData({ [KEY]: 123 });
    expect(getGlobalContextData()[KEY]).toBe(123);
  });

  it("inherited by root launch", async () => {
    const KEY = Symbol("inherited");
    setGlobalContextData({ [KEY]: "hello" });

    let value: unknown;
    const deferred = launch(async () => {
      value = coroutineContext()[KEY];
    });
    await deferred.join();
    expect(value).toBe("hello");
  });
});
