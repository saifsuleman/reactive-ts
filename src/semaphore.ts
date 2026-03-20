/**
 * A counting semaphore that limits concurrent access to a shared resource.
 *
 * @example
 * ```ts
 * const sem = new Semaphore(3); // allow 3 concurrent accessors
 * await sem.acquire();
 * try {
 *   // critical section
 * } finally {
 *   sem.release();
 * }
 * ```
 */
export class Semaphore {
  private count: number;
  private queue: (() => void)[] = [];

  /**
   * @param maxPermits - The maximum number of permits available.
   */
  constructor(maxPermits: number) {
    this.count = maxPermits;
  }

  /**
   * Acquires a permit, blocking if none are available until one is released.
   *
   * @returns A promise that resolves when a permit has been acquired.
   */
  async acquire() {
    if (this.count <= 0) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
    this.count--;
  }

  /**
   * Releases a permit, waking the next queued waiter (FIFO) if any.
   */
  release() {
    this.count++;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}
