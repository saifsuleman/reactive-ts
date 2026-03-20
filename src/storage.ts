/**
 * An async-context storage interface that propagates a store value
 * through asynchronous call chains.
 */
export interface ContextStorage<T> {
  /** Returns the current store value, or `undefined` if not inside a `run` call. */
  getStore(): T | undefined;

  /**
   * Executes {@link fn} with {@link store} as the current context value.
   *
   * @param store - The value to make available via {@link getStore} during execution.
   * @param fn - The function to execute within the context.
   * @returns The return value of {@link fn}.
   */
  run<R>(store: T, fn: () => R): R;
}

/**
 * Creates a {@link ContextStorage} backed by Node.js `AsyncLocalStorage`
 * when available, falling back to Zone.js in browser environments.
 *
 * @throws If neither `AsyncLocalStorage` nor Zone.js is available.
 *
 * @returns A promise that resolves with a {@link ContextStorage} instance.
 */
export async function createStorage<T>(): Promise<ContextStorage<T>> {
  try {
    const mod = await import("async_hooks");

    if (!mod.AsyncLocalStorage) {
      throw new Error();
    }

    const als = new mod.AsyncLocalStorage<T>();

    return {
      getStore: () => als.getStore(),
      run: (store, fn) => als.run(store, fn),
    };
  } catch {
    const g = globalThis as any;

    if (typeof g.Zone === "undefined") {
      throw new Error(
        "reactive-ts: no async context storage is available. " +
          "In browser environments, Zone.js must be loaded before reactive-ts.",
      );
    }

    const ZONE_KEY = "__reactive_ts__";

    return {
      getStore: () => g.Zone.current.get(ZONE_KEY),
      run: (store, fn) =>
        g.Zone.current
          .fork({ name: "reactive-ts", properties: { [ZONE_KEY]: store } })
          .run(fn),
    };
  }
}
