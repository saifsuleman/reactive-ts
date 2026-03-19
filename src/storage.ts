export interface ContextStorage<T> {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
}

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
