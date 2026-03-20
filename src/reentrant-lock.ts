import { coroutineContext } from "./coroutines";
import { Semaphore } from "./semaphore";

const REENTRANT_KEY = Symbol("Reentrant");

type ReentrantContextElement = {
  locks: Map<ReentrantLock, number>;
};

/**
 * A reentrant (recursive) mutual-exclusion lock for coroutines.
 *
 * The same coroutine may acquire the lock multiple times without deadlocking;
 * the lock is only released to other coroutines once it has been unlocked the
 * same number of times it was locked.
 *
 * @throws All methods throw if called outside a coroutine context.
 *
 * @example
 * ```ts
 * const mutex = new ReentrantLock();
 * launch(async () => {
 *   await mutex.lock();
 *   try {
 *     // critical section
 *   } finally {
 *     mutex.unlock();
 *   }
 * });
 * ```
 */
export class ReentrantLock {
  private sem = new Semaphore(1);

  /**
   * Acquires the lock. If another coroutine holds the lock, this call
   * suspends until it is released. Re-entrant calls from the same coroutine
   * increment the hold count and return immediately.
   */
  async lock() {
    const context = coroutineContext();

    if (!context[REENTRANT_KEY]) {
      context[REENTRANT_KEY] = { locks: new Map() };
    }

    const element = context[REENTRANT_KEY] as ReentrantContextElement;

    if (element.locks.has(this)) {
      element.locks.set(this, (element.locks.get(this) ?? 0) + 1);
      return;
    }

    await this.sem.acquire();
    element.locks.set(this, 1);
  }

  /**
   * Releases one hold on the lock. The underlying semaphore is only released
   * when the hold count reaches zero.
   *
   * @throws If the lock is not owned by the current coroutine.
   */
  unlock() {
    const context = coroutineContext();
    const element = context[REENTRANT_KEY] as
      | ReentrantContextElement
      | undefined;

    if (!element || !element.locks.has(this)) {
      throw new Error("lock not owned by this coroutine");
    }

    const count = element.locks.get(this)!;

    if (count > 1) {
      element.locks.set(this, count - 1);
      return;
    }

    element.locks.delete(this);
    this.sem.release();
  }
}
