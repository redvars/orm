import {
  afterAll,
  assert,
  assertEquals,
  beforeAll,
  describe,
  it,
} from "../../../test_deps.ts";

import { Session } from "../../test.utils.ts";
import type { ORMClient } from "../../../mod.ts";

async function getLedgerRows(
  client: ORMClient,
  tableName: string,
  changeType: string,
): Promise<any[]> {
  return await client.query().execute(
    `SELECT * FROM public._orm_migrations WHERE table_name = '${tableName}' AND change_type = '${changeType}';`,
  );
}

async function columnExists(
  client: ORMClient,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = await client.query().execute(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' AND column_name = '${columnName}';`,
  );
  return rows.length > 0;
}

describe({
  name: "Migration",
  fn: () => {
    let client: ORMClient;
    const cleanTableList: string[] = [];

    beforeAll(async () => {
      client = await Session.getClient();
    });

    afterAll(async () => {
      const client = await Session.getClient();
      for (const table of cleanTableList) {
        await client.dropTable(table);
      }
      client.closeConnection();
    });

    it("#defineTable - records CREATE_TABLE in the ledger", async () => {
      await client.defineTable({
        name: "invoice",
        columns: [{ name: "number", type: "string" }],
      });
      cleanTableList.push("invoice");

      const rows = await getLedgerRows(client, "invoice", "CREATE_TABLE");
      assertEquals(rows.length, 1);
    });

    it("#defineTable - records ADD_COLUMN on redefine", async () => {
      client.deregisterTable("invoice");
      await client.defineTable({
        name: "invoice",
        columns: [
          { name: "number", type: "string" },
          { name: "total", type: "integer" },
        ],
      });

      const rows = await getLedgerRows(client, "invoice", "ADD_COLUMN");
      assertEquals(rows.length, 1);
    });

    it("#defineTable - renames survive under the new name and record RENAME_COLUMN", async () => {
      await client.defineTable({
        name: "contact",
        columns: [{ name: "full_name", type: "string" }],
      });
      cleanTableList.push("contact");

      const contactTable = client.table("contact");
      const record = contactTable.createNewRecord();
      record.set("full_name", "Ada Lovelace");
      await record.insert();

      client.deregisterTable("contact");
      await client.defineTable({
        name: "contact",
        columns: [{ name: "display_name", type: "string" }],
        renames: { full_name: "display_name" },
      });

      const found = await client.table("contact").getRecord({
        display_name: "Ada Lovelace",
      });
      assert(found, "Expected the value to survive under the new column name");

      const rows = await getLedgerRows(client, "contact", "RENAME_COLUMN");
      assertEquals(rows.length, 1);
    });

    it("#defineTable - drop is opt-in via allowDestructiveMigrations", async () => {
      await client.defineTable({
        name: "draft_note",
        columns: [
          { name: "title", type: "string" },
          { name: "scratch", type: "string" },
        ],
      });
      cleanTableList.push("draft_note");

      client.deregisterTable("draft_note");
      await client.defineTable({
        name: "draft_note",
        columns: [{ name: "title", type: "string" }],
      });

      assert(
        await columnExists(client, "draft_note", "scratch"),
        "Column should still be present without allowDestructiveMigrations",
      );
      const noDropRows = await getLedgerRows(client, "draft_note", "DROP_COLUMN");
      assertEquals(noDropRows.length, 0);

      client.deregisterTable("draft_note");
      await client.defineTable({
        name: "draft_note",
        columns: [{ name: "title", type: "string" }],
        allowDestructiveMigrations: true,
      });

      assert(
        !(await columnExists(client, "draft_note", "scratch")),
        "Column should be dropped once allowDestructiveMigrations is set",
      );
      const dropRows = await getLedgerRows(client, "draft_note", "DROP_COLUMN");
      assertEquals(dropRows.length, 1);
    });

    it("#defineTable - best-effort type change on an empty table", async () => {
      await client.defineTable({
        name: "counter",
        columns: [{ name: "amount", type: "integer" }],
      });
      cleanTableList.push("counter");

      client.deregisterTable("counter");
      await client.defineTable({
        name: "counter",
        columns: [{ name: "amount", type: "number" }],
      });

      const rows = await client.query().execute(
        `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'counter' AND column_name = 'amount';`,
      );
      assertEquals(rows[0].data_type, "numeric");

      const ledgerRows = await getLedgerRows(client, "counter", "ALTER_COLUMN_TYPE");
      assertEquals(ledgerRows.length, 1);
    });
  },
});
