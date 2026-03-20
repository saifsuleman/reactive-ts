import { describe, it, expect, afterEach } from "vitest";
import { flow, FlowAbort, type Flow } from "../src/flow";
import { launch, setGlobalContextData } from "../src/coroutines";

afterEach(() => {
  setGlobalContextData({});
});

describe("flow", () => {
  it("is cold — doesn't execute until collected", async () => {
    let executed = false;
    const f = flow(async (emit) => {
      executed = true;
      await emit(1);
    });
    expect(executed).toBe(false);
    await f.array();
    expect(executed).toBe(true);
  });
});

describe("collect", () => {
  it("emits all values", async () => {
    const values: number[] = [];
    await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
      await emit(3);
    }).collect(async (v) => {
      values.push(v);
    });
    expect(values).toEqual([1, 2, 3]);
  });

  it("handles async producers", async () => {
    const values: number[] = [];
    await flow<number>(async (emit) => {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 5));
        await emit(i);
      }
    }).collect(async (v) => {
      values.push(v);
    });
    expect(values).toEqual([0, 1, 2]);
  });

  it("handles empty flow", async () => {
    const values: number[] = [];
    await flow<number>(async () => {}).collect(async (v) => {
      values.push(v);
    });
    expect(values).toEqual([]);
  });
});

describe("first", () => {
  it("returns first value", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(10);
      await emit(20);
    }).first();
    expect(result).toBe(10);
  });

  it("throws on empty flow", async () => {
    await expect(
      flow<number>(async () => {}).first(),
    ).rejects.toThrow("Flow is empty");
  });

  it("stops after first value", async () => {
    let emitCount = 0;
    await flow<number>(async (emit) => {
      emitCount++;
      await emit(1);
      emitCount++;
      await emit(2);
    }).first();
    // The producer runs, but FlowAbort stops after first emit
    expect(emitCount).toBe(1);
  });
});

describe("array", () => {
  it("collects all", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
      await emit(3);
    }).array();
    expect(result).toEqual([1, 2, 3]);
  });

  it("returns empty array for empty flow", async () => {
    const result = await flow<number>(async () => {}).array();
    expect(result).toEqual([]);
  });
});

describe("map", () => {
  it("transforms values", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
    })
      .map((v) => v * 10)
      .array();
    expect(result).toEqual([10, 20]);
  });

  it("chains with other operators", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
      await emit(3);
    })
      .map((v) => v + 1)
      .map((v) => v.toString())
      .array();
    expect(result).toEqual(["2", "3", "4"]);
  });
});

describe("filter", () => {
  it("keeps matching values", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
      await emit(3);
      await emit(4);
    })
      .filter((v) => v % 2 === 0)
      .array();
    expect(result).toEqual([2, 4]);
  });

  it("returns empty for no matches", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(3);
    })
      .filter((v) => v % 2 === 0)
      .array();
    expect(result).toEqual([]);
  });
});

describe("skip", () => {
  it("skips first N", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
      await emit(3);
    })
      .skip(2)
      .array();
    expect(result).toEqual([3]);
  });

  it("returns empty if skip >= total", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
    })
      .skip(5)
      .array();
    expect(result).toEqual([]);
  });

  it("skip(0) returns all", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
    })
      .skip(0)
      .array();
    expect(result).toEqual([1, 2]);
  });
});

describe("take", () => {
  it("takes first N", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
      await emit(3);
    })
      .take(2)
      .array();
    expect(result).toEqual([1, 2]);
  });

  it("returns all if take >= total", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
    })
      .take(5)
      .array();
    expect(result).toEqual([1, 2]);
  });

  it("take(0) returns empty", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
    })
      .take(0)
      .array();
    expect(result).toEqual([]);
  });
});

describe("chunked", () => {
  it("groups into chunks", async () => {
    const result = await flow<number>(async (emit) => {
      for (let i = 1; i <= 6; i++) await emit(i);
    })
      .chunked(3)
      .array();
    expect(result).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it("emits partial final chunk", async () => {
    const result = await flow<number>(async (emit) => {
      for (let i = 1; i <= 5; i++) await emit(i);
    })
      .chunked(3)
      .array();
    expect(result).toEqual([[1, 2, 3], [4, 5]]);
  });

  it("handles chunk > total", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
    })
      .chunked(10)
      .array();
    expect(result).toEqual([[1, 2]]);
  });

  it("chunked(1) works", async () => {
    const result = await flow<number>(async (emit) => {
      await emit(1);
      await emit(2);
    })
      .chunked(1)
      .array();
    expect(result).toEqual([[1], [2]]);
  });
});

describe("chaining", () => {
  it("filter → map → take", async () => {
    const result = await flow<number>(async (emit) => {
      for (let i = 1; i <= 10; i++) await emit(i);
    })
      .filter((v) => v % 2 === 0)
      .map((v) => v * 10)
      .take(3)
      .array();
    expect(result).toEqual([20, 40, 60]);
  });

  it("skip → take → chunked", async () => {
    const result = await flow<number>(async (emit) => {
      for (let i = 1; i <= 10; i++) await emit(i);
    })
      .skip(2)
      .take(6)
      .chunked(2)
      .array();
    expect(result).toEqual([[3, 4], [5, 6], [7, 8]]);
  });

  it("map → filter → skip → take", async () => {
    const result = await flow<number>(async (emit) => {
      for (let i = 0; i < 20; i++) await emit(i);
    })
      .map((v) => v * 2)
      .filter((v) => v % 4 === 0)
      .skip(1)
      .take(3)
      .array();
    expect(result).toEqual([4, 8, 12]);
  });
});

describe("cancellation", () => {
  it("collect stops when job is cancelled mid-stream", async () => {
    const emitted: number[] = [];

    const deferred = launch(async () => {
      try {
        await flow<number>(async (emit) => {
          for (let i = 0; i < 100; i++) {
            await emit(i);
            await new Promise((r) => setTimeout(r, 5));
          }
        }).collect(async (v) => {
          emitted.push(v);
        });
      } catch {
        // expected: JobCancelled
      }
    });

    // Let some values flow through
    await new Promise((r) => setTimeout(r, 30));
    deferred.cancel();

    try { await deferred.join(); } catch {}

    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.length).toBeLessThan(100);
  });
});
