import { currentJobOrNull } from "./coroutines";
import { getUncaughtExceptionHandler } from "./exceptions";

export class JobCancelled extends Error {
  constructor() {
    super("Job cancelled");
  }
}

export type Job = Deferred<unknown>;

export interface DeferredOptions {
  supervisor?: boolean;
}

export class Deferred<T> {
  public readonly children = new Set<Job>();
  public readonly isSupervisor: boolean;

  private _settled = false;
  private _cancelled = false;

  private completion: Promise<T>;
  private resolve!: (value: T) => void;
  private reject!: (reason?: unknown) => void;

  constructor(
    public readonly parent?: Job,
    options: DeferredOptions = {},
  ) {
    this.completion = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });

    this.isSupervisor = options.supervisor ?? false;

    if (parent) {
      parent.addChild(this as Job);

      // Wire rejection up to the parent so errors bubble to the root naturally.
      // Cancellations are excluded — they always originate from above and should
      // not travel back up the tree.
      this.completion.catch((err) => {
        if (!(err instanceof JobCancelled)) {
          if (parent.isSupervisor) {
            const handler = getUncaughtExceptionHandler();
            handler(err);
          } else {
            parent.fail(err);
          }
        }
      });
    } else {
      this.completion.catch((err) => {
        const handler = getUncaughtExceptionHandler();
        handler(err);
      });
    }
  }

  get isCancelled() {
    return this._cancelled;
  }

  cancel() {
    if (this._settled) return;

    this._settled = true;
    this._cancelled = true;

    for (const child of this.children) {
      child.cancel();
    }

    this.reject(new JobCancelled());
  }

  fail(error: unknown) {
    if (this._settled) return;

    this._settled = true;
    this._cancelled = true;

    for (const child of this.children) {
      child.cancel();
    }

    this.reject(error);
  }

  complete(value: T) {
    if (this._settled) return;
    this._settled = true;

    this.resolve(value);
    this.parent?.removeChild(this as unknown as Job);
  }

  async join() {
    try {
      await this.completion;
    } finally {
      // Always wait for descendants to finish — whether we succeeded or failed —
      // so that join() only returns once the entire subtree has settled.
      await Promise.allSettled([...this.children].map((c) => c.join()));
    }
  }

  addChild(job: Job) {
    this.children.add(job);
  }

  removeChild(job: Job) {
    this.children.delete(job);
  }
}

export function ensureActive() {
  const current = currentJobOrNull();
  if (current?.isCancelled) {
    throw new JobCancelled();
  }
}
