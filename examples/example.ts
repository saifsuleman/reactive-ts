import { getGlobalContextData, launch, setGlobalContextData } from "../src/coroutines";
import { delay } from "../src/delay";
import { UNCAUGHT_EXCEPTION_HANDLER_KEY, withUncaughtExceptionHandler } from "../src/exceptions";
import { flow } from "../src/flow";
import { JobCancelled } from "../src/job";
import { ReentrantLock } from "../src/reentrant-lock";

setGlobalContextData({
  ...getGlobalContextData(),
  [UNCAUGHT_EXCEPTION_HANDLER_KEY]: (error: unknown) => {
    console.log(error);
  },
});

const job = launch(
  () => {
    launch(async () => {
      await delay(5000);
      throw new Error("other hello");
    });

    withUncaughtExceptionHandler(
      (error) => {
        console.log("error.");
      },
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
  { supervisor: true },
);

job.join().then(
  () => {},
  (error) => {
    console.error(error);
  },
);
