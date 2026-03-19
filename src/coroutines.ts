import { createStorage, type ContextStorage } from "./storage";
import { Deferred, type Job } from "./job";

export const JOB_KEY = Symbol("Job");

export type CoroutineContextMetadata = { [JOB_KEY]: Job };
export type CoroutineContextData = Record<symbol, any>;
export type CoroutineContext = CoroutineContextMetadata & CoroutineContextData;

const storage = await createStorage<CoroutineContext>();

export function coroutineContextOrNull(): CoroutineContext | null {
  return storage.getStore() ?? null;
}

export function coroutineContext(): CoroutineContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("No coroutine context found");
  }
  return ctx;
}

export function currentJob(): Job {
  return coroutineContext()[JOB_KEY];
}

export function currentJobOrNull(): Job | null {
  return coroutineContextOrNull()?.[JOB_KEY] ?? null;
}

export function withContext<T>(ctx: Record<symbol, any>, fn: () => T): T {
  if (ctx[JOB_KEY]) {
    throw new Error("cannot override coroutine identity with `withContext`");
  }

  const parent = coroutineContext();
  const merged = { ...parent, ...ctx };
  return storage.run(merged, fn);
}

export interface LaunchOptions {
  supervisor?: boolean;
}

export function launch<T>(
  fn: () => Promise<T> | T,
  options: LaunchOptions = {},
): Deferred<T> {
  const parent: CoroutineContextData = storage.getStore() ?? {};
  const supervisor = options.supervisor ?? false;
  const deferred = new Deferred<T>(parent[JOB_KEY], { supervisor });

  const context: CoroutineContext = {
    ...parent,
    [JOB_KEY]: deferred as Job,
  };

  storage.run(context, async () => {
    try {
      const result = await fn();
      await Promise.allSettled(
        [...deferred.children].map((child) => child.join()),
      );
      deferred.complete(result);
      return result;
    } catch (error) {
      deferred.fail(error);
    }
  });

  return deferred;
}
