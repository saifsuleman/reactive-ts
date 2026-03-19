> [!IMPORTANT]
> **reactive-ts** is in development and not yet production-ready. Use at your own risk.
> This **README** is also temporaily outdated while the library evolves.
> For now, read `src/example.ts` for examples on what library usage looks like.

# reactive-ts

Structured concurrency, reactive streams, and synchronization primitives for TypeScript — inspired by [Kotlin Coroutines](https://kotlinlang.org/docs/coroutines-overview.html).

## Motivation

Kotlin has one of the best concurrency stories of any modern language. Coroutines give you structured concurrency out of the box — tasks form a parent-child hierarchy, failures propagate naturally, and nothing leaks when a scope ends. Combine that with `Flow` for reactive streams and `Mutex`/`Semaphore` for synchronization, and you have a cohesive, predictable model for writing concurrent code.

TypeScript has none of this. `async/await` is great for sequential async code, but the moment you need to manage the lifetime of multiple concurrent tasks, you're on your own. There's no way to say "these three jobs belong together and should fail together." There's no standard lazy stream primitive. There are no lock primitives in the runtime. You end up duct-taping together `Promise.all`, `AbortController`, third-party observable libraries, and hand-rolled flags — and it's still fragile.

`reactive-ts` is an attempt to bring that Kotlin model to Node.js. It's not a port, and it doesn't try to replicate coroutines at the language level. Instead it takes the core ideas — structured scopes, implicit context propagation, cold streams, cooperative cancellation — and expresses them in idiomatic TypeScript using the primitives Node already gives us, namely `async/await` and `AsyncLocalStorage`.

## Structured Concurrency

The central idea is that concurrent work should have structure. `coroutineScope` creates a scope that owns all the jobs launched inside it. It doesn't complete until every child finishes, and if any child fails, the rest are cancelled and the error bubbles up. You cannot accidentally orphan a background task.

```ts
const scope = coroutineScope(() => {
  launch(async () => { /* job 1 */ });
  launch(async () => { /* job 2 */ });
});

await scope.join(); // completes only when both jobs do
```

Cancellation flows down the tree automatically. Cancel a parent and every descendant is cancelled. This makes timeouts, user-initiated cancellation, and error handling dramatically simpler to reason about.

## Coroutine Context

Every coroutine runs with an implicit `CoroutineContext` — a key-value store that's automatically propagated through the async call stack via `AsyncLocalStorage`. You never pass it around manually. Scoped values are just available wherever you are in the call tree.

This is also how `ReentrantMutex` works. Rather than tracking lock ownership by thread (there are no threads), it tracks it by coroutine context — so the same coroutine can acquire the same lock multiple times without deadlocking, which makes recursive and compositional code much easier to write safely.

## Reactive Streams

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

Because flows check the current job's cancellation status on every emit, they participate in structured concurrency automatically. If the enclosing scope is cancelled, the stream stops at the next emission point — no special handling required.

## Synchronization Primitives

`Mutex`, `ReentrantMutex`, and `Semaphore` fill a gap that the JS runtime simply doesn't address. Even in single-threaded async code, interleaved `await` points create real race conditions — and without lock primitives, the only defense is careful reasoning about execution order.

## Roadmap

- **Publish to NPM registry**
- **More Flow operators** — `flatMap`, `zip`, `combine`, `debounce`, and others from the Kotlin Flow API
- **Channels** — a `Channel<T>` primitive for communication between coroutines, similar to Go channels and `kotlinx.coroutines.channels`
- **Hot streams** — `SharedFlow` and `StateFlow` equivalents for broadcast and state-holding use cases
- **Cross-runtime support** — `CoroutineContext` currently relies on Node's `AsyncLocalStorage`. Investigate support for Bun, Deno, and browser environments, where that API may differ or be unavailable

## Install

Requires Node.js 18+ and TypeScript 5+. Zero runtime dependencies.
