import { launch } from "../src/coroutines";
import { delay } from "../src/delay";
import { flow } from "../src/flow";
import { JobCancelled } from "../src/job";
import { ReentrantLock } from "../src/reentrant-lock";

const job = launch(
  async () => {
    const tasks = [
      launch(async () => {
        await delay(5000);
        throw new Error("other hello");
      }),

      launch(async () => {
        const mutex = new ReentrantLock();
        await mutex.lock();
        await mutex.lock();
        await delay(2000);
        throw new Error("my dih hurt");
      }),

      launch(async () => {
        try {
          await flow<number>(async (emit) => {
            for (let i = 0; i < 100; i++) {
              await emit(i);
              await delay(100);
            }
          })
            .chunked(3)
            .skip(2)
            .take(5)
            .map((chunk) => chunk.reduce((a, b) => a + b, 0))
            .map((result) => `Result: ${result}`)
            .collect(console.log);
        } catch (ex) {
          if (ex instanceof JobCancelled) {
            console.log("Job cancelled before we could finish :c");
          }
        }
      }),
    ];

    await delay(5000000);
  },
  { supervisor: true },
);

job.join().then(
  () => {},
  (error) => {
    console.error(error);
  },
);
setTimeout(() => {}, 100000000);
