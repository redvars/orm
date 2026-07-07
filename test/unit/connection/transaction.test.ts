import {
  afterAll,
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
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

    it("#transaction - tx.query() runs against the transaction's connection", async () => {
      await client.transaction(async (tx) => {
        const rows = await tx.query().execute("SELECT 1 as one");
        assertEquals(rows[0].one, 1);
      });
    });

    it("#transaction - supports multiple tables in one transaction", async () => {
      await client.defineTable({
        name: "transaction_test_secondary",
        columns: [{ name: "label", type: "string" }],
      });
      cleanTableList.push("transaction_test_secondary");

      await client.transaction(async (tx) => {
        const primary = tx.table("transaction_test").createNewRecord();
        primary.set("name", "multi-table-primary");
        await primary.insert();

        const secondary = tx.table("transaction_test_secondary")
          .createNewRecord();
        secondary.set("label", "multi-table-secondary");
        await secondary.insert();
      });

      const primaryRecords = await client.table("transaction_test").toArray();
      const secondaryRecords = await client.table("transaction_test_secondary")
        .toArray();
      assert(
        primaryRecords.some((r) => r.get("name") === "multi-table-primary"),
      );
      assert(
        secondaryRecords.some((r) =>
          r.get("label") === "multi-table-secondary"
        ),
      );
    });

    it("#transaction - tx.table() throws for an undefined table", async () => {
      await client.transaction(async (tx) => {
        assertThrows(() => tx.table("transaction_test_unknown"));
      });
    });
  },
});
