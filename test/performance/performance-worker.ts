import { msToTime } from "./utils.ts";
import { ORM } from "../../mod.ts";

const start = performance.now();

const client = await new ORM({
  hostname: "127.0.0.1",
  port: 5432,
  username: "postgres",
  password: "postgres",
  database: "orm-performance-test",
}).connect(true);

const worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
  type: "module",
  deno: {
    permissions: "inherit",
  },
});

await client.defineTable({
  name: "department",
  columns: [
    {
      name: "name",
      type: "string",
    },
    {
      name: "description",
      type: "string",
    },
  ],
});

const interval = setInterval(() => {
  worker.postMessage("status");
}, 100);

const numberOfThreads = 5;
const numberOfRecords = 100000;
function startThreads() {
  for (let i = 0; i < numberOfThreads; i++) {
    worker.postMessage({ set: i, size: numberOfRecords / numberOfThreads });
  }
}

let i = 0;

worker.addEventListener("message", async function (e) {
  if (e.data === "online") {
    clearInterval(interval);
    startThreads();
  } else if (e.data === "complete") {
    console.log("done");
    i++;
    if (i == numberOfThreads) {
      worker.terminate();
      console.log("size:: " + (await client.table("department").count()));
      await client.dropDatabase();
      console.log(msToTime(performance.now() - start));
    }
  }
});
