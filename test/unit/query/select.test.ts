import {
  afterAll,
  assertStrictEquals,
  beforeAll,
  describe,
  it,
} from "../../../test_deps.ts";

import { Session } from "../../test.utils.ts";
import type { ORMClient } from "../../../mod.ts";

describe(
  "SELECT Query",
  {
    sanitizeResources: false,
    sanitizeOps: false,
  },
  () => {
    let client: ORMClient;

    beforeAll(async () => {
      client = await Session.getClient();
      await client.defineTable({
        name: "task",
        columns: [
          {
            name: "description",
            type: "string",
          },
          {
            name: "state",
            type: "string",
            default: "new",
          },
          {
            name: "priority",
            type: "integer",
            default: 0,
          },
          {
            name: "order",
            type: "integer",
            default: 100,
          },
          {
            name: "active",
            type: "boolean",
            default: true,
          },
        ],
      });
      const taskTable = client.table("task");
      for (let i = 0; i < 10; i++) {
        const taskRecord = taskTable.createNewRecord();
        taskRecord.set("description", `Task [priority 1] ${i}`);
        taskRecord.set("priority", 1);
        taskRecord.set("order", Math.floor(Math.random() * 100));
        await taskRecord.insert();
      }
      for (let i = 0; i < 30; i++) {
        const taskRecord = taskTable.createNewRecord();
        taskRecord.set("description", `Task [priority 2] ${i}`);
        taskRecord.set("priority", 2);
        taskRecord.set("order", Math.floor(Math.random() * 100));
        await taskRecord.insert();
      }
      for (let i = 0; i < 20; i++) {
        const taskRecord = taskTable.createNewRecord();
        taskRecord.set("description", `Task [priority 3] ${i}`);
        taskRecord.set("priority", 3);
        taskRecord.set("order", Math.floor(Math.random() * 100));
        await taskRecord.insert();
      }
    });

    afterAll(async () => {
      const client = await Session.getClient();
      await client.dropTable("task");
      (await Session.getClient()).closeConnection();
    });

    it("#simple select query", async () => {
      const taskTable = client.table("task");
      let count = await taskTable.count();
      assertStrictEquals(count, 60, "Should be 60 records");

      taskTable.initializeQuery();
      taskTable.where("priority", 1);
      count = await taskTable.count();
      assertStrictEquals(count, 10, "Should be 10 records");

      taskTable.initializeQuery();
      taskTable.where("priority", 1);
      taskTable.orWhere("description", "ILIKE", "Task [priority 3]%");
      count = await taskTable.count();
      assertStrictEquals(count, 30, "Should be 30 records");
    });

    it("#simple in select query", async () => {
      const taskTable = client.table("task");
      taskTable.where("priority", [1, 2]);
      const count = await taskTable.count();
      assertStrictEquals(count, 40, "Should be 40 records");
    });

    it("#select - filter and sort", async () => {
      const taskTable = client.table("task");
      taskTable.where("priority", 1);
      taskTable.offset(5);
      taskTable.orderBy("order", "ASC");
      const taskCursor = await taskTable.execute();
      for await (const taskRecord of taskCursor()) {
        const priority = taskRecord.get("priority");
        assertStrictEquals(priority, 1, "Should be 1");
      }
    });

    it("#select - sort DESC", async () => {
      const taskTable = client.table("task");
      taskTable.orderBy("order", "DESC");
      const taskCursor = await taskTable.execute();
      let prevOrder;
      for await (const taskRecord of taskCursor()) {
        const order = taskRecord.get("order");
        if (prevOrder) {
          assertStrictEquals(
            prevOrder >= order,
            true,
            "Previous order is greater than current order",
          );
        }
        prevOrder = order;
      }
    });

    it("#select - client.query", async () => {
      const taskQuery = client.query();
      taskQuery.select(["priority"]);
      taskQuery.from("task");
      taskQuery.where("priority", 2);
      taskQuery.orderBy([
        {
          column: "order",
          order: "ASC",
        },
      ]);

      const taskGroupedRecords = await taskQuery.execute();
      for (const taskGroupedRecord of taskGroupedRecords) {
        assertStrictEquals(
          taskGroupedRecord.priority,
          2,
          "priority should be 2",
        );
        assertStrictEquals(
          typeof taskGroupedRecord.description,
          "undefined",
          "except priority, all other fields should be undefined",
        );
      }
    });

    it("#select - group by", async () => {
      const taskQuery = client.query();
      taskQuery.select("priority", "count(*)::int as count");
      taskQuery.from("task");
      taskQuery.groupBy("priority");
      taskQuery.orderBy("count", "ASC");

      const taskGroupedRecords = await taskQuery.execute();

      assertStrictEquals(taskGroupedRecords.length, 3, "Expected 3 records");
      assertStrictEquals(
        taskGroupedRecords[0].priority,
        1,
        "Expected priority 1",
      );
      assertStrictEquals(taskGroupedRecords[0].count, 10, "Expected count 10");
      assertStrictEquals(
        taskGroupedRecords[1].priority,
        3,
        "Expected priority 3",
      );
      assertStrictEquals(taskGroupedRecords[1].count, 20, "Expected count 20");
    });

    it("#select - getRecord", async () => {
      const taskTable = client.table("task");
      const taskRecord = taskTable.createNewRecord();
      const createdTaskId = taskRecord.getID();
      taskRecord.set("description", "getRecord test");
      await taskRecord.insert();

      const foundRecord = await taskTable.getRecord({
        description: "getRecord test",
      });
      assertStrictEquals(
        createdTaskId,
        foundRecord?.getID(),
        "Record not found",
      );
    });

    it("#select - limit via Table", async () => {
      const taskTable = client.table("task");
      taskTable.initializeQuery();
      taskTable.limit(5);
      const records = await taskTable.toArray();
      assertStrictEquals(records.length, 5, "Should be limited to 5 records");
    });

    it("#select - column map form ({col: true})", async () => {
      const taskQuery = client.query();
      taskQuery.select({ priority: true, description: true });
      taskQuery.from("task");
      taskQuery.where("priority", 1);
      const rows = await taskQuery.execute();
      assertStrictEquals(rows.length, 10, "Should be 10 records");
      for (const row of rows) {
        assertStrictEquals(row.priority, 1, "priority should be 1");
        assertStrictEquals(
          typeof row.description,
          "string",
          "description should be selected",
        );
      }
    });

    it("#select - IS NULL shorthand via where(column, '=', null)", async () => {
      const taskQuery = client.query();
      taskQuery.select("id");
      taskQuery.from("task");
      taskQuery.where("description", "=", null);
      const rows = await taskQuery.execute();
      assertStrictEquals(
        rows.length,
        0,
        "No task should have a null description",
      );
    });

    it("#select - where(true)/where(false) literal shorthand", async () => {
      const allRows = await client.query().select("id").from("task").where(true)
        .execute();
      assertStrictEquals(allRows.length, 61, "where(true) should match every row");

      const noRows = await client.query().select("id").from("task").where(false)
        .execute();
      assertStrictEquals(noRows.length, 0, "where(false) should match no rows");
    });

    it("#select - nested compound where(fn) via Table", async () => {
      const taskTable = client.table("task");
      taskTable.initializeQuery();
      taskTable.where((subClause) => {
        subClause.where("priority", 1).orWhere("priority", 3);
      });
      taskTable.andWhere("active", true);
      const count = await taskTable.count();
      assertStrictEquals(
        count,
        30,
        "Expected priority 1 or 3, all active (10 + 20)",
      );
    });
  },
);
