import { ORM } from "../../mod.ts";
import { msToTime } from "./utils.ts";

const start = performance.now();
const client = await new ORM({
  hostname: "127.0.0.1",
  port: 5432,
  username: "postgres",
  password: "postgres",
  database: "orm-performance-test",
}).connect(true);

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
const departmentTable = client.table("department");
for (let i = 0; i < 100000; i++) {
  const newRecord = departmentTable.createNewRecord();
  newRecord.set("name", `Department ${i}`);
  newRecord.set("description", `Description ${i}`);
  await newRecord.insert();
}

console.log("size:: " + (await client.table("department").count()));

await client.dropDatabase();

console.log(msToTime(performance.now() - start));
