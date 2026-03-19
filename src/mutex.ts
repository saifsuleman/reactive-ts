import Semaphore from "./semaphore.js";

export default class Mutex {
  private semaphore = new Semaphore(1);

  async lock() {
    await this.semaphore.acquire();
  }

  unlock() {
    this.semaphore.release();
  }
}
