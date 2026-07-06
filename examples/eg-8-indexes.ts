import getORM from "./getORM.ts";

const odm = getORM();
const client = await odm.connect(true);

// Per-column index.
await client.defineTable({
  name: "product",
  columns: [
    {
      name: "name",
      type: "string",
    },
    {
      name: "sku",
      type: "string",
      index: true,
    },
  ],
});

// Table-level composite index.
await client.defineTable({
  name: "order_item",
  columns: [
    {
      name: "order_id",
      type: "string",
    },
    {
      name: "product_id",
      type: "string",
    },
  ],
  index: [["order_id", "product_id"]],
});

const indexes = await client.query().execute(
  `SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('product', 'order_item') ORDER BY tablename, indexname;`,
);
console.log(indexes);

client.closeConnection();
