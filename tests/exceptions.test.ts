import { describe, it, expect, afterEach } from "vitest";
import {
  withUncaughtExceptionHandler,
  getUncaughtExceptionHandler,
  UNCAUGHT_EXCEPTION_HANDLER_KEY,
} from "../src/exceptions";
import { launch, setGlobalContextData, coroutineContext } from "../src/coroutines";

afterEach(() => {
  setGlobalContextData({});
});

describe("withUncaughtExceptionHandler", () => {
  it("sets handler in context", async () => {
    const handler = () => {};
    let contextHandler: unknown;

    const deferred = launch(async () => {
      await withUncaughtExceptionHandler(handler, async () => {
        contextHandler = coroutineContext()[UNCAUGHT_EXCEPTION_HANDLER_KEY];
      });
    });

    await deferred.join();
    expect(contextHandler).toBe(handler);
  });

  it("handler receives errors from failed supervisor children", async () => {
    const errors: unknown[] = [];

    const deferred = launch(
      async () => {
        await withUncaughtExceptionHandler(
          (error) => {
            errors.push(error);
          },
          async () => {
            launch(async () => {
              throw new Error("supervised error");
            });
            await new Promise((r) => setTimeout(r, 50));
          },
        );
      },
      { supervisor: true },
    );

    await deferred.join();
    expect(errors.length).toBe(1);
    expect((errors[0] as Error).message).toBe("supervised error");
  });

  it("requires coroutine context", async () => {
    await expect(
      withUncaughtExceptionHandler(() => {}, async () => {}),
    ).rejects.toThrow("No coroutine context found");
  });
});

describe("getUncaughtExceptionHandler", () => {
  it("returns default when none set", () => {
    const handler = getUncaughtExceptionHandler();
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("default handler rethrows", () => {
    const handler = getUncaughtExceptionHandler();
    const err = new Error("test");
    expect(() => handler(err)).toThrow("test");
  });
});
