import {
  afterAll,
  assert,
  assertEquals,
  assertThrows,
  beforeAll,
  describe,
  it,
} from "../../../test_deps.ts";
import { ORM } from "../../../mod.ts";
import { Session } from "../../test.utils.ts";
import { defaultConfig } from "../../test.utils.ts";
import type { ORMClient } from "../../../mod.ts";

describe({
  name: "ORMClient",
  fn: () => {
    describe({
      name: "connection lifecycle",
      fn: () => {
        it("#testConnection / #dropDatabase", async () => {
          const odm = new ORM({
            ...defaultConfig,
            database: "orm-client-test-lifecycle",
          });
          const client = await odm.connect(true);
          await client.testConnection();
          await client.dropDatabase();
        });

        it("#closeConnection - ends the pool, a fresh connect() still works", async () => {
          const odm = new ORM({
            ...defaultConfig,
            database: "orm-client-test-close",
          });
          const client = await odm.connect(true);
          client.closeConnection();

          const reconnected = await odm.connect();
          await reconnected.dropDatabase();
        });
      },
    });

    describe({
      name: "table/query factories",
      fn: () => {
        let client: ORMClient;

        beforeAll(async () => {
          client = await Session.getClient();
        });

        afterAll(() => {
          client.closeConnection();
        });

        it("#deregisterTable - removes a table definition from the registry", async () => {
          const odm = Session.getORM();
          await client.defineTable({
            name: "orm_client_scratch",
            columns: [{ name: "name", type: "string" }],
          });
          assert(odm.isTableDefined("orm_client_scratch"));

          client.deregisterTable("orm_client_scratch");
          assert(!odm.isTableDefined("orm_client_scratch"));

          await client.dropTable("orm_client_scratch");
        });

        it("#table - throws for an undefined table", () => {
          const error = assertThrows(() =>
            client.table("orm_client_does_not_exist")
          );
          assertEquals((error as any).code, "TABLE_DEFINITION_VALIDATION");
        });

        it("#query - returns a usable Query facade", async () => {
          const rows = await client.query().execute("SELECT 1 as one");
          assertEquals(rows[0].one, 1);
        });
      },
    });
  },
});
