import { launch } from "./coroutines";
import { delay } from "./delay";

class TimeoutException extends Error {
  constructor() {
    super("TimeoutException");
  }
}

export async function withTimeout<T>(
  durationMillis: number,
  callback: () => Promise<T> | T
): Promise<T> {
  return await launch(async () => {
    const task = launch(callback);

    const timeout = launch(async () => {
      await delay(durationMillis);
      throw new TimeoutException();
    });

    try {
      return await Promise.race([ task, timeout ]);
    } finally {
      task.cancel();
      timeout.cancel();
    }
  }, { supervisor: true });
}
