export default class Semaphore {
  private count: number;
  private queue: (() => void)[] = [];

  constructor(count: number) {
    this.count = count;
  }

  async acquire() {
    if (this.count <= 0) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
    this.count--;
  }

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
