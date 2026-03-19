import { coroutineContext, withContext } from "./coroutines";

export type UncaughtExceptionHandler = (error: unknown) => void;

const CONTEXT_KEY = Symbol("UncaughtExceptionHandler");

const DEFAULT_HANDLER = (error: unknown) => {
  throw error;
};

export function withUncaughtExceptionHandler(
  handler: UncaughtExceptionHandler,
  callback: () => Promise<void> | void,
): Promise<void> {
  return withContext({ [CONTEXT_KEY]: handler }, callback);
}

export function getUncaughtExceptionHandler(): UncaughtExceptionHandler {
  return coroutineContext()[CONTEXT_KEY] ?? DEFAULT_HANDLER;
}
