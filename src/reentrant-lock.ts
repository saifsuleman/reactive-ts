import { coroutineContext } from "./coroutines";
import { Semaphore } from "./semaphore";

const REENTRANT_KEY = Symbol("Reentrant");

type ReentrantContextElement = {
  locks: Map<ReentrantLock, number>;
};

export class ReentrantLock {
  private sem = new Semaphore(1);

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
