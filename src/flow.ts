import { ensureActive } from "./job.js";

const NOT_FOUND_SYMBOL = Symbol("NOT_FOUND");

export type EmitFn<T> = (value: T) => Promise<void> | void;
export type FlowProducer<T> = (emit: EmitFn<T>) => Promise<void> | void;
export class FlowAbort extends Error {}

export interface Flow<T> {
  // Terminal ops
  collect(emit: EmitFn<T>): Promise<void>;
  first(): Promise<T>;
  array(): Promise<T[]>;

  // Transformation ops (non terminal)
  map<U>(transform: (value: T) => U): Flow<U>;
  filter(predicate: (value: T) => boolean): Flow<T>;
  skip(amount: number): Flow<T>;
  take(amount: number): Flow<T>;
  chunked(amount: number): Flow<T[]>;
}

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
