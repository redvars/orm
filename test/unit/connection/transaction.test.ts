import {
  afterAll,
  assert,
  assertEquals,
  assertRejects,
  beforeAll,
  describe,
  it,
} from "../../../test_deps.ts";

import { Session } from "../../test.utils.ts";
import type { ORMClient } from "../../../mod.ts";

describe({
  name: "Transactions",
  fn: () => {
    let client: ORMClient;
    const cleanTableList: string[] = [];

    beforeAll(async () => {
      client = await Session.getClient();
      await client.defineTable({
        name: "transaction_test",
        columns: [{ name: "name", type: "string" }],
      });
      cleanTableList.push("transaction_test");
    });

    afterAll(async () => {
      const client = await Session.getClient();
      for (const table of cleanTableList) {
        await client.dropTable(table);
      }
      client.closeConnection();
    });

    it("#transaction - commits on success", async () => {
      await client.transaction(async (tx) => {
        const table = tx.table("transaction_test");
        const first = table.createNewRecord();
        first.set("name", "committed-1");
        await first.insert();

        const second = table.createNewRecord();
        second.set("name", "committed-2");
        await second.insert();
      });

      const records = await client.table("transaction_test").toArray();
      const names = records.map((r) => r.get("name"));
      assert(names.includes("committed-1"));
      assert(names.includes("committed-2"));
    });

    it("#transaction - rolls back on error", async () => {
      const before = await client.table("transaction_test").count();

      await assertRejects(async () => {
        await client.transaction(async (tx) => {
          const table = tx.table("transaction_test");
          const record = table.createNewRecord();
          record.set("name", "should-be-rolled-back");
          await record.insert();
          throw new Error("boom");
        });
      }, Error);

      const after = await client.table("transaction_test").count();
      assertEquals(after, before, "Row count should be unchanged after rollback");

      const records = await client.table("transaction_test").toArray();
      const names = records.map((r) => r.get("name"));
      assert(!names.includes("should-be-rolled-back"));
    });
  },
});
