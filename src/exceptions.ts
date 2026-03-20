import { coroutineContextOrNull, withContext } from "./coroutines";

/**
 * A function that handles uncaught errors from supervisor children.
 */
export type UncaughtExceptionHandler = (error: unknown) => void;

/**
 * Context key for the uncaught exception handler.
 */
export const UNCAUGHT_EXCEPTION_HANDLER_KEY = Symbol("UncaughtExceptionHandler");
const DEFAULT_HANDLER: UncaughtExceptionHandler = (error) => {
  throw error;
};

/**
 * Executes {@link callback} with the given uncaught exception handler
 * installed in the coroutine context. Errors from supervisor children
 * within the scope are routed to {@link handler} instead of propagating.
 *
 * @param handler - The handler to invoke on uncaught child errors.
 * @param callback - The function to execute within the handler scope.
 * @returns A promise that resolves with the return value of {@link callback}.
 * @throws If called outside a coroutine.
 *
 * @example
 * ```ts
 * await withUncaughtExceptionHandler(
 *   (err) => console.error("caught:", err),
 *   async () => {
 *     launch(async () => { throw new Error("oops"); });
 *   },
 * );
 * ```
 */
export async function withUncaughtExceptionHandler<T>(
  handler: UncaughtExceptionHandler,
  callback: () => Promise<T> | T
): Promise<T> {
  return await withContext({
    [UNCAUGHT_EXCEPTION_HANDLER_KEY]: handler,
  }, callback);
}

/**
 * Returns the uncaught exception handler from the current coroutine context,
 * or the default handler (which rethrows) if none has been set.
 */
export function getUncaughtExceptionHandler(): UncaughtExceptionHandler {
  const context = coroutineContextOrNull();
  return context?.[UNCAUGHT_EXCEPTION_HANDLER_KEY] ?? DEFAULT_HANDLER;
}
