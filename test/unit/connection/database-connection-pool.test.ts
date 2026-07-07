import { assert, assertRejects, describe, it } from "../../../test_deps.ts";
import DatabaseConnectionPool from "../../../src/core/connection/DatabaseConnectionPool.ts";
import type { TDatabaseConfiguration } from "../../../mod.ts";
import { defaultConfig } from "../../test.utils.ts";

describe({
  name: "DatabaseConnectionPool",
  fn() {
    it("should establish a connection", async () => {
      const connectionPool = new DatabaseConnectionPool(defaultConfig);
      await connectionPool.testConnection();
      connectionPool.end();
    });

    it("should reject the connection request", async () => {
      const config: TDatabaseConfiguration = {
        ...defaultConfig,
        port: 80,
      };
      await assertRejects(async () => {
        await DatabaseConnectionPool.createConnectionPoll({
          ...config,
        });
      }, Error);
    });

    it("#createDatabase / #dropDatabase - self-contained lifecycle", async () => {
      const connectionPool = await DatabaseConnectionPool.createConnectionPoll(
        defaultConfig,
      );
      try {
        await connectionPool.createDatabase("pool-lifecycle-test-db");

        const dbConnection = await DatabaseConnectionPool.createConnectionPoll(
          {
            ...defaultConfig,
            database: "pool-lifecycle-test-db",
          },
        );
        await dbConnection.testConnection();
        dbConnection.end();
      } finally {
        await connectionPool.dropDatabase("pool-lifecycle-test-db");
        connectionPool.end();
      }
    });

    it("#multi database connection pools", async () => {
      const pools = await Promise.all(
        Array.from(
          { length: 5 },
          () => DatabaseConnectionPool.createConnectionPoll(defaultConfig),
        ),
      );
      assert(pools.length === 5);
      for (const pool of pools) pool.end();
    });

    it("#end pool connections", async () => {
      const dbConnection = await DatabaseConnectionPool.createConnectionPoll(
        {
          ...defaultConfig,
          database: "postgres",
        },
      );
      try {
        dbConnection.end();
      } catch (_error) {
        assert(false, "ending pool connections failed");
      }
    });
  },
});
