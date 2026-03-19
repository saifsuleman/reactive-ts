import { coroutineContext } from "./coroutines.js";
import Mutex from "./mutex.js";

const REENTRANT_KEY = Symbol("Reentrant");

type ReentrantContextElement = {
  mutexes: Map<ReentrantMutex, number>;
};

export default class ReentrantMutex {
  private mutex = new Mutex();

  async lock() {
    const context = coroutineContext();

    if (!context[REENTRANT_KEY]) {
      context[REENTRANT_KEY] = { mutexes: new Map() };
    }

    const element = context[REENTRANT_KEY] as ReentrantContextElement;

    if (element.mutexes.has(this)) {
      element.mutexes.set(this, (element.mutexes.get(this) ?? 0) + 1);
      return;
    }

    await this.mutex.lock();
    element.mutexes.set(this, 1);
  }

  unlock() {
    const context = coroutineContext();
    const element = context[REENTRANT_KEY] as
      | ReentrantContextElement
      | undefined;

    if (!element || !element.mutexes.has(this)) {
      throw new Error("Mutex not owned by this coroutine");
    }

    const count = element.mutexes.get(this)!;

    if (count > 1) {
      element.mutexes.set(this, count - 1);
      return;
    }

    element.mutexes.delete(this);
    this.mutex.unlock();
  }
}
