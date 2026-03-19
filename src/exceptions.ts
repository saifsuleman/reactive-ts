import { coroutineContextOrNull, withContext } from "./coroutines";

export type UncaughtExceptionHandler = (error: unknown) => void;

export const UNCAUGHT_EXCEPTION_HANDLER_KEY = Symbol("UncaughtExceptionHandler");
const DEFAULT_HANDLER: UncaughtExceptionHandler = (error) => {
  throw error;
};

export async function withUncaughtExceptionHandler<T>(
  handler: UncaughtExceptionHandler,
  callback: () => Promise<T> | T
): Promise<T> {
  return await withContext({
    [UNCAUGHT_EXCEPTION_HANDLER_KEY]: handler,
  }, callback);
}

export function getUncaughtExceptionHandler(): UncaughtExceptionHandler {
  const context = coroutineContextOrNull();
  return context?.[UNCAUGHT_EXCEPTION_HANDLER_KEY] ?? DEFAULT_HANDLER;
}
