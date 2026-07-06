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

async function getIndexNames(
  client: ORMClient,
  schema: string,
  table: string,
): Promise<string[]> {
  const rows = await client.query().execute(
    `SELECT indexname FROM pg_indexes WHERE schemaname = '${schema}' AND tablename = '${table}';`,
  );
  return rows.map((row: { indexname: string }) => row.indexname);
}

describe({
  name: "Index",
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

    it("#defineTable - per-column index", async () => {
      await client.defineTable({
        name: "product",
        columns: [
          {
            name: "sku",
            type: "string",
            index: true,
          },
        ],
      });
      cleanTableList.push("product");

      const indexNames = await getIndexNames(client, "public", "product");
      assert(
        indexNames.includes("idx_product_sku"),
        "Expected idx_product_sku to exist",
      );
    });

    it("#defineTable - table-level composite index", async () => {
      await client.defineTable({
        name: "order_item",
        columns: [
          { name: "order_id", type: "string" },
          { name: "product_id", type: "string" },
        ],
        index: [["order_id", "product_id"]],
      });
      cleanTableList.push("order_item");

      const indexNames = await getIndexNames(client, "public", "order_item");
      assert(
        indexNames.includes("idx_order_item_order_id_product_id"),
        "Expected composite index to exist",
      );
    });

    it("#defineTable - alter adds index for newly-indexed column", async () => {
      await client.defineTable({
        name: "customer",
        columns: [{ name: "name", type: "string" }],
      });
      cleanTableList.push("customer");

      client.deregisterTable("customer");
      await client.defineTable({
        name: "customer",
        columns: [
          { name: "name", type: "string" },
          { name: "email", type: "string", index: true },
        ],
      });

      const indexNames = await getIndexNames(client, "public", "customer");
      assert(
        indexNames.includes("idx_customer_email"),
        "Expected idx_customer_email to be added on redefine",
      );
    });

    it("#defineTable - is idempotent for indexes", async () => {
      const before = await getIndexNames(client, "public", "product");

      client.deregisterTable("product");
      await client.defineTable({
        name: "product",
        columns: [
          {
            name: "sku",
            type: "string",
            index: true,
          },
        ],
      });

      const after = await getIndexNames(client, "public", "product");
      assertEquals(after.sort(), before.sort());
    });
  },
});
