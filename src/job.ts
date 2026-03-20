import { currentJobOrNull } from "./coroutines";

/**
 * Error thrown when a job is cancelled.
 */
export class JobCancelled extends Error {
  constructor(public reason?: unknown) {
    super("Job cancelled");
  }
}

/** A job handle — an alias for `Deferred<unknown>`. */
export type Job = Deferred<unknown>;

/**
 * Options for constructing a {@link Deferred}.
 */
export interface DeferredOptions {
  /**
   * When `true`, child failures are routed to the uncaught exception handler
   * instead of failing this job.
   * @default false
   */
  supervisor?: boolean;
}

/**
 * A deferred value that represents a coroutine's lifecycle.
 *
 * A `Deferred` can be completed with a value, failed with an error, or
 * cancelled. It forms a parent-child tree that enables structured concurrency:
 * cancelling a parent cancels all descendants, and (for non-supervisors) a
 * child failure propagates to the parent.
 *
 * @typeParam T - The type of the value produced on completion.
 */
export class Deferred<T> implements Promise<T> {
  /** The set of child jobs owned by this deferred. */
  public readonly children = new Set<Job>();

  /** Whether this deferred acts as a supervisor. */
  public readonly isSupervisor: boolean;

  private _settled = false;
  private _cancelled = false;
  private _exception: unknown | undefined = undefined;

  private completion: Promise<T>;
  private resolve!: (value: T) => void;
  private reject!: (reason?: unknown) => void;

  /**
   * @param parent - The parent job, if any. Child errors propagate to non-supervisor parents.
   * @param options - Construction options.
   */
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
        if (!(err instanceof JobCancelled)
          && !parent.isSupervisor) {
          parent.fail(err);
        }
      });
    }
  }

  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined): Promise<TResult1 | TResult2> {
    return this.completion.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined): Promise<T | TResult> {
    return this.completion.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<T> {
    return this.completion.finally(onfinally);
  }

  [Symbol.toStringTag]: string = "Deferred";

  /** Whether this deferred has been cancelled (or failed). */
  get isCancelled() {
    return this._cancelled;
  }

  get exception() {
    return this._exception;
  }

  /**
   * Cancels this deferred and all of its children. The completion promise
   * rejects with {@link JobCancelled}. No-op if already settled.
   */
  cancel() {
    if (this._settled) return;

    this._settled = true;
    this._cancelled = true;

    for (const child of this.children) {
      child.cancel();
    }

    this.reject(new JobCancelled());
  }

  /**
   * Fails this deferred with the given error and cancels all children.
   * No-op if already settled.
   *
   * @param error - The error to reject with.
   */
  fail(error: unknown) {
    if (this._settled) return;

    this._settled = true;
    this._cancelled = true;
    this._exception = error;

    for (const child of this.children) {
      child.fail(error);
    }

    this.reject(error);
  }

  /**
   * Completes this deferred with the given value and removes it from its
   * parent's children. No-op if already settled.
   *
   * @param value - The completion value.
   */
  complete(value: T) {
    if (this._settled) return;
    this._settled = true;

    this.resolve(value);
    this.parent?.removeChild(this as unknown as Job);
  }

  /**
   * Waits for this deferred and all of its descendants to settle.
   *
   * @returns A promise that resolves when the entire subtree has settled.
   * @throws Rejects with the deferred's error if it was failed or cancelled.
   */
  async join() {
    try {
      await this.completion;
    } finally {
      // Always wait for descendants to finish — whether we succeeded or failed —
      // so that join() only returns once the entire subtree has settled.
      await Promise.allSettled([...this.children].map((c) => c.join()));
    }
  }

  /**
   * Registers a child job.
   *
   * @param job - The child to add.
   */
  addChild(job: Job) {
    this.children.add(job);
  }

  /**
   * Unregisters a child job.
   *
   * @param job - The child to remove.
   */
  removeChild(job: Job) {
    this.children.delete(job);
  }
}

/**
 * Throws {@link JobCancelled} if the current job has been cancelled.
 * No-op when called outside a coroutine or when the job is still active.
 */
export function ensureActive() {
  const current = currentJobOrNull();
  if (current?.isCancelled) {
    throw new JobCancelled();
  }
}
