import { launch } from "./coroutines";
import { delay } from "./delay";
import { withUncaughtExceptionHandler } from "./exceptions";
import { flow } from "./flow";
import { JobCancelled } from "./job";
import { ReentrantLock } from "./reentrant-lock";

const job = launch(
  () => {
    withUncaughtExceptionHandler(
      (error) => console.log("oops"),
      async () => {
        launch(async () => {
          const mutex = new ReentrantLock();
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
      },
    );
  },
  { supervisor: false },
);

job.join().then(
  () => {},
  (error) => {
    console.error(error);
  },
);
