import { currentJobOrNull } from "./coroutines";

export class JobCancelled extends Error {
  constructor() {
    super("Job cancelled");
  }
}

export type Job = Deferred<unknown>;

export class Deferred<T> {
  readonly children = new Set<Job>();

  private _cancelled = false;
  private _completed = false;

  private completion: Promise<T>;
  private resolve!: (value: T) => void;
  private reject!: (reason?: any) => void;

  constructor(public readonly parent?: Job) {
    this.completion = new Promise((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });

    this.parent?.addChild(<Job>this);
  }

  get isCancelled() {
    return this._cancelled;
  }

  cancel() {
    if (this._cancelled) return;

    this._cancelled = true;

    for (const child of this.children) {
      child.cancel();
    }

    this.reject(new JobCancelled());
  }

  async join() {
    await this.completion;
    await Promise.allSettled([...this.children].map((c) => c.join()));
  }

  complete(value: T) {
    if (this._completed) return;

    this._completed = true;
    this.resolve(value);
    this.parent?.removeChild(<Job>this);
  }

  addChild(job: Job) {
    this.children.add(job);
  }

  removeChild(job: Job) {
    this.children.delete(job);
  }

  fail(error: any) {
    if (this._completed) return;
    this._completed = true;
    this._cancelled = true;

    for (const child of this.children) {
      child.fail(error);
    }

    this.reject(error);
    this.parent?.fail(error);
  }
}

export function ensureActive() {
  const current = currentJobOrNull();
  if (current?.isCancelled) {
    throw new JobCancelled();
  }
}
