/// <reference lib="WebWorker"/>

import { ORM } from "../../mod.ts";

const orm = new ORM({
  hostname: "127.0.0.1",
  port: 5432,
  username: "postgres",
  password: "postgres",
  database: "orm-performance-test",
  max_connections: 100,
});

self.onmessage = async (event) => {
  if (event.data == "status") {
    self.postMessage("online");
    return;
  }

  const client = await orm.connect();

  if (!orm.isTableDefined("department")) {
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
  }

  const departmentTable = client.table("department");
  for (let i = 0; i < event.data.size; i++) {
    const newRecord = departmentTable.createNewRecord();
    newRecord.set("name", `Department ${i * event.data.set}`);
    newRecord.set(
      "description",
      `Description ${i * (event.data.set * event.data.set)}`,
    );
    await newRecord.insert();
  }
  await departmentTable.toArray();

  client.closeConnection();
  self.postMessage("complete");
};
