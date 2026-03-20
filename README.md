> [!IMPORTANT]
> **reactive-ts** is in development and not yet production-ready. Use at your own risk.

# reactive-ts

Structured concurrency, reactive streams, and synchronization primitives for TypeScript — inspired by [Kotlin Coroutines](https://kotlinlang.org/docs/coroutines-overview.html).

## Motivation

Kotlin has one of the best concurrency stories of any modern language. Coroutines give you structured concurrency out of the box — tasks form a parent-child hierarchy, failures propagate naturally, and nothing leaks when a scope ends. Combine that with `Flow` for reactive streams and `Mutex`/`Semaphore` for synchronization, and you have a cohesive, predictable model for writing concurrent code.

TypeScript has none of this. `async/await` is great for sequential async code, but the moment you need to manage the lifetime of multiple concurrent tasks, you're on your own. There's no way to say "these three jobs belong together and should fail together." There's no standard lazy stream primitive. There are no lock primitives in the runtime. You end up duct-taping together `Promise.all`, `AbortController`, third-party observable libraries, and hand-rolled flags — and it's still fragile.

`reactive-ts` brings that Kotlin model to TypeScript. It's not a port, and it doesn't try to replicate coroutines at the language level. Instead it takes the core ideas — structured scopes, implicit context propagation, cold streams, cooperative cancellation — and expresses them in idiomatic TypeScript on top of `async/await`. Context propagation uses `AsyncLocalStorage` where available (Node.js, Bun, Deno) and falls back to Zone.js in browser environments.

### Structured Concurrency

The central idea is that concurrent work should have structure. `launch` creates a job that owns all the child jobs launched inside it. It doesn't complete until every child finishes, and if any child fails, the rest are cancelled and the error bubbles up. You cannot accidentally orphan a background task.

```ts
const job = launch(() => {
  launch(async () => { /* job 1 */ });
  launch(async () => { /* job 2 */ });
});

await job.join(); // completes only when both jobs do
```

Pass `{ supervisor: true }` to create a supervisor job that isolates child failures instead of propagating them upward.

Cancellation flows down the tree automatically. Cancel a parent and every descendant is cancelled. This makes timeouts, user-initiated cancellation, and error handling dramatically simpler to reason about.

### Coroutine Context

Every coroutine runs with an implicit `CoroutineContext` — a symbol-keyed key-value store that's automatically propagated through the async call stack. You never pass it around manually. Scoped values are just available wherever you are in the call tree.

```ts
const job = launch(() => {
  const ctx = coroutineContext(); // get current context
  const job = currentJob();       // get current job

  withContext({ [myKey]: "value" }, async () => {
    // runs with merged context
  });
});
```

This is also how `ReentrantLock` works. Rather than tracking lock ownership by thread (there are no threads), it tracks it by coroutine context — so the same coroutine can acquire the same lock multiple times without deadlocking, which makes recursive and compositional code much easier to write safely.

### Reactive Streams

`Flow` is a cold, lazy, cancellation-aware stream. Cold means nothing executes until you collect it — there's no wasted work, no backpressure to manage, no subscriptions to clean up. You just describe a pipeline and run it when you're ready.

```ts
await flow<number>(async (emit) => {
  for (let i = 0; i < 1000; i++) {
    await emit(i);
  }
})
  .filter(n => n % 2 === 0)
  .chunked(5)
  .take(3)
  .collect(console.log);
```

Available operators: `map`, `filter`, `skip`, `take`, `chunked`. Terminal operations: `collect`, `first`, `array`.

Because flows check the current job's cancellation status on every emit, they participate in structured concurrency automatically. If the enclosing scope is cancelled, the stream stops at the next emission point — no special handling required.

### Synchronization Primitives

`ReentrantLock` and `Semaphore` fill a gap that the JS runtime simply doesn't address. Even in single-threaded async code, interleaved `await` points create real race conditions — and without lock primitives, the only defense is careful reasoning about execution order.

```ts
const lock = new ReentrantLock();
await lock.lock();
// critical section — same coroutine can lock() again without deadlocking
lock.unlock();

const sem = new Semaphore(3);
await sem.acquire(); // up to 3 concurrent holders
sem.release();
```

### Uncaught Exception Handler

By default, when a child job fails inside a supervisor scope, the error is rethrown. You can override this behavior by installing an uncaught exception handler into the coroutine context using `withUncaughtExceptionHandler`. The handler receives errors from failed child jobs in supervisor scopes instead of letting them propagate.

```ts
const job = launch(() => {
  withUncaughtExceptionHandler((error) => {
    console.error("caught:", error);
  }, async () => {
    launch(async () => {
      throw new Error("this won't crash the parent");
    });
  });
}, { supervisor: true });
```

You can also set a handler globally via `setGlobalContextData` so it applies to all root coroutines:

```ts
setGlobalContextData({
  ...getGlobalContextData(),
  [UNCAUGHT_EXCEPTION_HANDLER_KEY]: (error: unknown) => {
    console.error(error);
  },
});
```

## API Reference

### Concurrency

| Export | Description |
|---|---|
| `launch(fn, options?)` | Launch a new coroutine, returns a `Deferred<T>` |
| `withContext(data, fn)` | Run a function with merged context data |
| `coroutineContext()` | Get the current `CoroutineContext` (throws if none) |
| `coroutineContextOrNull()` | Get the current `CoroutineContext` or `null` |
| `currentJob()` | Get the current `Job` from context |
| `currentJobOrNull()` | Get the current `Job` or `null` |
| `setGlobalContextData(data)` | Set default context data for root coroutines |
| `getGlobalContextData()` | Get the current global context data |
| `ensureActive()` | Throw `JobCancelled` if the current job is cancelled |
| `delay(ms)` | Promise-based delay utility |
| `withUncaughtExceptionHandler(handler, fn)` | Run a function with a custom error handler for supervisor child failures |
| `getUncaughtExceptionHandler()` | Get the current handler from context (falls back to rethrowing) |
| `UNCAUGHT_EXCEPTION_HANDLER_KEY` | Symbol key for setting the handler via context or global data |

### Job / Deferred

`Deferred<T>` represents a running coroutine. `Job` is an alias for `Deferred<unknown>`.

| Member | Description |
|---|---|
| `join()` | Wait for the job and all descendants to settle |
| `cancel()` | Cancel the job and all its children |
| `fail(error)` | Fail the job with an error, cancelling children |
| `complete(value)` | Resolve the job with a value |
| `children` | `Set<Job>` of child jobs |
| `isCancelled` | Whether the job has been cancelled |
| `isSupervisor` | Whether this is a supervisor job |
| `parent` | Parent job, if any |

### Flow

| Member | Description |
|---|---|
| `flow(producer)` | Create a cold stream from a producer function |
| `.map(fn)` | Transform each emitted value |
| `.filter(fn)` | Keep values matching a predicate |
| `.skip(n)` | Skip the first `n` values |
| `.take(n)` | Take only the first `n` values |
| `.chunked(n)` | Buffer values into arrays of size `n` |
| `.collect(fn)` | Terminal — consume all values |
| `.first()` | Terminal — get the first value |
| `.array()` | Terminal — collect all values into an array |

### Synchronization

| Export | Description |
|---|---|
| `ReentrantLock` | Mutual exclusion lock, reentrant per coroutine context |
| `Semaphore(maxPermits)` | Counting semaphore for bounding concurrency |

## Roadmap

- **Publish to NPM registry**
- **More Flow operators** — `flatMap`, `zip`, `combine`, `debounce`, and others from the Kotlin Flow API
- **Channels** — a `Channel<T>` primitive for communication between coroutines, similar to Go channels and `kotlinx.coroutines.channels`
- **Hot streams** — `SharedFlow` and `StateFlow` equivalents for broadcast and state-holding use cases

## Install

Requires Node.js 18+ and TypeScript 5+. Zero runtime dependencies.
