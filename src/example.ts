import { coroutineScope, launch } from "./coroutines";
import { delay } from "./delay";
import { flow } from "./flow";
import { JobCancelled } from "./job";
import ReentrantMutex from "./reentrant-mutex";

const job = coroutineScope(() => {
  launch(async () => {
    const mutex = new ReentrantMutex();
    await mutex.lock();
    await mutex.lock();
    await delay(2000);
    throw new Error("my dih hurt");
  });

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
  });
});

job.join().then(
  () => {},
  (error) => {
    console.error(error);
  },
);
