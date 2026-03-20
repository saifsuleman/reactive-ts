import { launch } from "../src/coroutines";
import { delay } from "../src/delay";

const result = launch(() => {
  launch(async () => {
    await delay(4000);
  });
}, { supervisor: true });

result.then(() => {
  console.log("complete.");
});

setTimeout(() => {}, 1000000);
