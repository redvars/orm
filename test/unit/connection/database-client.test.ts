import { assert, assertEquals, describe, it } from "../../../test_deps.ts";
import DatabaseConnectionPool from "../../../src/core/connection/DatabaseConnectionPool.ts";
import { defaultConfig } from "../../test.utils.ts";

describe({
  name: "DatabaseClient",
  fn: () => {
    it("#executeQuery - runs a raw query and returns rows", async () => {
      const pool = new DatabaseConnectionPool(defaultConfig);
      const client = await pool.connect();
      try {
        const result = await client.executeQuery("SELECT 1 as one");
        assertEquals(result.rows[0].one, 1);
      } finally {
        client.release();
        pool.end();
      }
    });

    it("#doesSchemaExist / #createSchema", async () => {
      const pool = new DatabaseConnectionPool(defaultConfig);
      const client = await pool.connect();
      const schemaName = "database_client_test_schema";
      try {
        await client.executeQuery(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        assertEquals(await client.doesSchemaExist(schemaName), false);

        await client.createSchema(schemaName);
        assertEquals(await client.doesSchemaExist(schemaName), true);
      } finally {
        await client.executeQuery(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        client.release();
        pool.end();
      }
    });

    it("#createCursor - supports incremental reads", async () => {
      const pool = new DatabaseConnectionPool(defaultConfig);
      const client = await pool.connect();
      try {
        const cursor = await client.createCursor(
          "SELECT * FROM generate_series(1, 3) as n",
        );
        const rows = await cursor.read(3);
        assertEquals(rows.length, 3);
      } finally {
        client.release();
        pool.end();
      }
    });

    it("#on - registers an event listener without throwing or firing spuriously", async () => {
      const pool = new DatabaseConnectionPool(defaultConfig);
      const client = await pool.connect();
      try {
        let called = false;
        client.on("error", () => {
          called = true;
        });
        assert(!called);
      } finally {
        client.release();
        pool.end();
      }
    });

    it("#withNonReleasingHandle - release() on the derived handle is a no-op", async () => {
      const pool = new DatabaseConnectionPool(defaultConfig);
      const client = await pool.connect();
      const nonReleasing = client.withNonReleasingHandle();

      nonReleasing.release();

      // The underlying connection should still be usable - a real release()
      // would have returned it to the pool, making this query risky/invalid.
      const result = await client.executeQuery("SELECT 1 as one");
      assertEquals(result.rows[0].one, 1);

      client.release();
      pool.end();
    });
  },
});
