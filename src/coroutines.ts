import { createStorage } from "./storage";
import { Deferred, type Job } from "./job";

/**
 * Context key used to store the current {@link Job} in a coroutine context.
 */
export const JOB_KEY = Symbol("Job");

/** The metadata portion of a coroutine context (the current job). */
export type CoroutineContextMetadata = { [JOB_KEY]: Job };

/** Arbitrary symbol-keyed data stored in a coroutine context. */
export type CoroutineContextData = Record<symbol, unknown>;

/** The full coroutine context: metadata plus user-defined data. */
export type CoroutineContext = CoroutineContextMetadata & CoroutineContextData;

let globalContextData: CoroutineContextData = {};

/**
 * Returns the global context data that is inherited by root-level `launch` calls.
 */
export function getGlobalContextData(): CoroutineContextData {
  return globalContextData;
}

/**
 * Replaces the global context data inherited by root-level `launch` calls.
 *
 * @param data - The new global context data.
 */
export function setGlobalContextData(data: CoroutineContextData): void {
  globalContextData = data;
}

const storage = await createStorage<CoroutineContext>();

/**
 * Returns the current coroutine context, or `null` if called outside a coroutine.
 */
export function coroutineContextOrNull(): CoroutineContext | null {
  return storage.getStore() ?? null;
}

/**
 * Returns the current coroutine context.
 *
 * @throws If called outside a coroutine.
 */
export function coroutineContext(): CoroutineContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("No coroutine context found");
  }
  return ctx;
}

/**
 * Returns the {@link Job} associated with the current coroutine.
 *
 * @throws If called outside a coroutine.
 */
export function currentJob(): Job {
  return coroutineContext()[JOB_KEY];
}

/**
 * Returns the {@link Job} associated with the current coroutine,
 * or `null` if called outside a coroutine.
 */
export function currentJobOrNull(): Job | null {
  return coroutineContextOrNull()?.[JOB_KEY] ?? null;
}

/**
 * Executes {@link fn} with additional context data merged into the current
 * coroutine context. The parent context is not mutated.
 *
 * @param ctx - Symbol-keyed data to merge into the context.
 * @param fn - The function to execute within the extended context.
 * @returns A promise that resolves with the return value of {@link fn}.
 * @throws If {@link ctx} contains {@link JOB_KEY} (coroutine identity cannot be overridden).
 * @throws If called outside a coroutine.
 */
export function withContext<T>(
  ctx: CoroutineContextData,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (ctx[JOB_KEY]) {
    throw new Error("cannot override coroutine identity with `withContext`");
  }

  const parent = coroutineContext();
  const merged = { ...parent, ...ctx };
  return storage.run(merged, async () => await fn());
}

/**
 * Options for {@link launch}.
 */
export interface LaunchOptions {
  /**
   * When `true`, child failures are routed to the uncaught exception handler
   * instead of failing the parent job.
   * @default false
   */
  supervisor?: boolean;
}

/**
 * Launches a new coroutine that runs {@link fn} concurrently.
 *
 * The returned {@link Deferred} completes after {@link fn} returns **and**
 * all child coroutines have settled.
 *
 * @param fn - The coroutine body.
 * @param options - Launch options (e.g. supervisor mode).
 * @returns A {@link Deferred} representing the coroutine's lifecycle.
 *
 * @example
 * ```ts
 * const job = launch(async () => {
 *   await delay(1000);
 *   return 42;
 * });
 * await job.join();
 * ```
 */
export function launch<T>(
  fn: () => Promise<T> | T,
  options: LaunchOptions = {},
): Deferred<T> {
  const parent: CoroutineContextData = storage.getStore() ?? globalContextData;
  const supervisor = options.supervisor ?? false;
  const deferred = new Deferred<T>(parent[JOB_KEY] as Job | undefined, { supervisor });

  const context: CoroutineContext = {
    ...parent,
    [JOB_KEY]: deferred as Job,
  };

  void storage.run(context, async () => {
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
