import { ensureActive } from "./job";

const NOT_FOUND_SYMBOL = Symbol("NOT_FOUND");

/** A function that receives emitted flow values. */
export type EmitFn<T> = (value: T) => Promise<void> | void;

/**
 * A producer function that emits values into a flow.
 *
 * @param emit - Callback to emit a value downstream.
 */
export type FlowProducer<T> = (emit: EmitFn<T>) => Promise<void> | void;

/**
 * Sentinel error used internally to abort flow collection early
 * (e.g. by {@link Flow.first} or {@link Flow.take}).
 */
export class FlowAbort extends Error {}

/**
 * A cold, asynchronous stream of values.
 *
 * Flows are lazy — the producer does not execute until a terminal operation
 * (`collect`, `first`, or `array`) is called. Intermediate operations
 * (`map`, `filter`, `skip`, `take`, `chunked`) return new `Flow` instances
 * and do not trigger execution.
 *
 * @typeParam T - The type of values emitted by this flow.
 */
export interface Flow<T> {
  /**
   * Terminal: collects every emitted value by passing it to {@link emit}.
   *
   * @param emit - Callback invoked for each value.
   */
  collect(emit: EmitFn<T>): Promise<void>;

  /**
   * Terminal: returns the first emitted value.
   *
   * @throws If the flow is empty.
   */
  first(): Promise<T>;

  /**
   * Terminal: collects all emitted values into an array.
   */
  array(): Promise<T[]>;

  /**
   * Intermediate: transforms each value with {@link transform}.
   *
   * @param transform - Mapping function applied to each value.
   */
  map<U>(transform: (value: T) => U): Flow<U>;

  /**
   * Intermediate: keeps only values that satisfy {@link predicate}.
   *
   * @param predicate - Filter function.
   */
  filter(predicate: (value: T) => boolean): Flow<T>;

  /**
   * Intermediate: drops the first {@link amount} values.
   *
   * @param amount - Number of values to skip.
   */
  skip(amount: number): Flow<T>;

  /**
   * Intermediate: emits at most {@link amount} values, then stops.
   *
   * @param amount - Maximum number of values to take.
   */
  take(amount: number): Flow<T>;

  /**
   * Intermediate: groups values into arrays of size {@link amount}.
   * A partial final chunk is emitted if the total is not evenly divisible.
   *
   * @param amount - Chunk size.
   */
  chunked(amount: number): Flow<T[]>;
}

/**
 * Creates a cold {@link Flow} from a producer function.
 *
 * @param producer - A function that emits values via its `emit` callback.
 * @returns A new cold flow.
 *
 * @example
 * ```ts
 * const numbers = flow<number>(async (emit) => {
 *   for (let i = 0; i < 5; i++) await emit(i);
 * });
 * const result = await numbers.filter(n => n % 2 === 0).array();
 * // result: [0, 2, 4]
 * ```
 */
export function flow<T>(producer: FlowProducer<T>): Flow<T> {
  return new FlowImpl(producer);
}

class FlowImpl<T> implements Flow<T> {
  constructor(private producer: FlowProducer<T>) {}

  async collect(emit: EmitFn<T>): Promise<void> {
    await this.producer(async (v) => {
      ensureActive();
      await emit(v);
    });
  }

  async first(): Promise<T> {
    let result: T | typeof NOT_FOUND_SYMBOL = NOT_FOUND_SYMBOL;

    try {
      await this.collect(async (v) => {
        result = v;
        throw new FlowAbort();
      });
    } catch (e) {
      if (!(e instanceof FlowAbort)) {
        throw e;
      }
    }

    if (result === NOT_FOUND_SYMBOL) {
      throw new Error("Flow is empty");
    }

    return result;
  }

  async array(): Promise<T[]> {
    const result: T[] = [];
    await this.collect(async (v) => {
      result.push(v);
    });
    return result;
  }

  map<U>(transform: (value: T) => U): Flow<U> {
    return new FlowImpl(async (emit) => {
      await this.collect(async (v) => {
        await emit(transform(v));
      });
    });
  }

  filter(predicate: (value: T) => boolean): Flow<T> {
    return new FlowImpl(async (emit) => {
      await this.collect(async (v) => {
        if (predicate(v)) {
          await emit(v);
        }
      });
    });
  }

  skip(amount: number): Flow<T> {
    return new FlowImpl(async (emit) => {
      let skipped = 0;
      await this.collect(async (v) => {
        if (skipped < amount) {
          skipped++;
          return;
        }
        await emit(v);
      });
    });
  }

  take(amount: number): Flow<T> {
    return new FlowImpl(async (emit) => {
      let taken = 0;
      try {
        await this.collect(async (v) => {
          if (taken >= amount) {
            throw new FlowAbort();
          }
          taken++;
          await emit(v);
        });
      } catch (e) {
        if (!(e instanceof FlowAbort)) {
          throw e;
        }
      }
    });
  }

  chunked(amount: number): Flow<T[]> {
    return new FlowImpl(async (emit) => {
      let chunk: T[] = [];
      await this.collect(async (v) => {
        chunk.push(v);
        if (chunk.length === amount) {
          await emit(chunk);
          chunk = [];
        }
      });
      if (chunk.length > 0) {
        await emit(chunk);
      }
    });
  }
}
