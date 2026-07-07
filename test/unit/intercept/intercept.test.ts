import {
  afterAll,
  assertStrictEquals,
  beforeAll,
  describe,
  it,
} from "../../../test_deps.ts";

import type {
  ORM,
  ORMClient,
  Record,
  Table,
  TRecordInterceptorType,
} from "../../../mod.ts";
import { logger, Session } from "../../test.utils.ts";
import RecordInterceptor from "../../../src/operation-interceptor/RecordInterceptor.ts";

describe({
  name: "Operations Intercept",
  fn: () => {
    let odm: ORM;
    let client: ORMClient;
    const cleanTableList: string[] = [];
    const INTERCEPT_TEST_MODEL = "intercept_test";

    beforeAll(async () => {
      client = await Session.getClient();
      odm = Session.getORM();
    });

    afterAll(async () => {
      const client = await Session.getClient();
      for (const table of cleanTableList) {
        await client.dropTable(table);
      }
      (await Session.getClient()).closeConnection();
    });

    it("#ORM::addInterceptor", async () => {
      odm.addInterceptor(
        new (class extends RecordInterceptor {
          getName() {
            return "my-intercept";
          }

          async intercept(
            table: Table,
            operation: TRecordInterceptorType,
            records: Record[],
          ) {
            if (
              table.getName() === INTERCEPT_TEST_MODEL &&
              operation === "BEFORE_INSERT"
            ) {
              logger.info(
                `[tableName=${table.getName()}] [operation=${operation}]`,
              );
              for (const record of records) {
                record.set("computed", "this is computed");
              }
            }
            return records;
          }
        })(),
      );

      await client.defineTable({
        name: INTERCEPT_TEST_MODEL,
        columns: [
          {
            name: "name",
            type: "string",
          },
          {
            name: "computed",
            type: "string",
          },
        ],
      });
      cleanTableList.push(INTERCEPT_TEST_MODEL);

      const interceptTestTable = client.table(INTERCEPT_TEST_MODEL);
      const s = interceptTestTable.createNewRecord();
      s.set("name", "John");
      try {
        const interceptRecord: Record = await s.insert();
        assertStrictEquals(
          interceptRecord.get("computed"),
          "this is computed",
          "read interceptor not computed the value",
        );
      } catch (err: any) {
        logger.info(err.message + "");
      }
    });

    it("#DatabaseOperationInterceptorService - runs multiple interceptors in ascending order", async () => {
      const executionOrder: string[] = [];

      const makeOrderTrackingInterceptor = (name: string, order: number) => {
        const interceptor = new (class extends RecordInterceptor {
          getName() {
            return name;
          }
          async intercept(
            _table: Table,
            _operation: TRecordInterceptorType,
            records: Record[],
          ) {
            executionOrder.push(name);
            return records;
          }
        })();
        interceptor.setOrder(order);
        return interceptor;
      };

      const second = makeOrderTrackingInterceptor("order-test-second", 200);
      const first = makeOrderTrackingInterceptor("order-test-first", 50);

      // Register the higher-order one first, to prove registration order
      // doesn't determine execution order.
      odm.addInterceptor(second);
      odm.addInterceptor(first);

      try {
        const table = client.table(INTERCEPT_TEST_MODEL);
        const record = table.createNewRecord();
        await table.intercept("BEFORE_INSERT", [record]);
        assertStrictEquals(
          executionOrder.includes("order-test-first") &&
            executionOrder.includes("order-test-second"),
          true,
        );
        assertStrictEquals(
          executionOrder.indexOf("order-test-first") <
            executionOrder.indexOf("order-test-second"),
          true,
          "lower-order interceptor should run before the higher-order one",
        );
      } finally {
        odm.deleteInterceptor("order-test-first");
        odm.deleteInterceptor("order-test-second");
      }
    });

    it("#Table::disableIntercept - disables only the named interceptor", async () => {
      const ran: string[] = [];

      const makeTracker = (name: string) =>
        new (class extends RecordInterceptor {
          getName() {
            return name;
          }
          async intercept(
            _table: Table,
            _operation: TRecordInterceptorType,
            records: Record[],
          ) {
            ran.push(name);
            return records;
          }
        })();

      odm.addInterceptor(makeTracker("disable-test-a"));
      odm.addInterceptor(makeTracker("disable-test-b"));

      try {
        const table = client.table(INTERCEPT_TEST_MODEL);
        table.disableIntercept("disable-test-a");

        const record = table.createNewRecord();
        await table.intercept("BEFORE_INSERT", [record]);

        assertStrictEquals(ran.includes("disable-test-a"), false);
        assertStrictEquals(ran.includes("disable-test-b"), true);
      } finally {
        odm.deleteInterceptor("disable-test-a");
        odm.deleteInterceptor("disable-test-b");
      }
    });

    it("#Table::disableIntercepts - disables every interceptor for that table", async () => {
      const ran: string[] = [];
      const tracker = new (class extends RecordInterceptor {
        getName() {
          return "disable-all-test";
        }
        async intercept(
          _table: Table,
          _operation: TRecordInterceptorType,
          records: Record[],
        ) {
          ran.push("disable-all-test");
          return records;
        }
      })();
      odm.addInterceptor(tracker);

      try {
        const table = client.table(INTERCEPT_TEST_MODEL);
        table.disableIntercepts();

        const record = table.createNewRecord();
        await table.intercept("BEFORE_INSERT", [record]);

        assertStrictEquals(ran.length, 0);
      } finally {
        odm.deleteInterceptor("disable-all-test");
      }
    });

    it("#ORM::deleteInterceptor - permanently removes a registered interceptor", async () => {
      const ran: string[] = [];
      const tracker = new (class extends RecordInterceptor {
        getName() {
          return "delete-test";
        }
        async intercept(
          _table: Table,
          _operation: TRecordInterceptorType,
          records: Record[],
        ) {
          ran.push("delete-test");
          return records;
        }
      })();
      odm.addInterceptor(tracker);

      const table = client.table(INTERCEPT_TEST_MODEL);
      await table.intercept("BEFORE_INSERT", [table.createNewRecord()]);
      assertStrictEquals(ran.length, 1, "interceptor should run before deletion");

      odm.deleteInterceptor("delete-test");
      await table.intercept("BEFORE_INSERT", [table.createNewRecord()]);
      assertStrictEquals(
        ran.length,
        1,
        "interceptor should not run again after deletion",
      );
    });

    it("#DatabaseOperationInterceptorService - a falsy return short-circuits the remaining chain", async () => {
      const ran: string[] = [];

      const swallowing = new (class extends RecordInterceptor {
        getName() {
          return "short-circuit-swallow";
        }
        async intercept() {
          ran.push("short-circuit-swallow");
          return undefined as unknown as Record[];
        }
      })();
      swallowing.setOrder(10);

      const shouldNeverRun = new (class extends RecordInterceptor {
        getName() {
          return "short-circuit-never";
        }
        async intercept(
          _table: Table,
          _operation: TRecordInterceptorType,
          records: Record[],
        ) {
          ran.push("short-circuit-never");
          return records;
        }
      })();
      shouldNeverRun.setOrder(20);

      odm.addInterceptor(swallowing);
      odm.addInterceptor(shouldNeverRun);

      try {
        const table = client.table(INTERCEPT_TEST_MODEL);
        const result = await table.intercept("BEFORE_INSERT", [
          table.createNewRecord(),
        ]);

        assertStrictEquals(ran.includes("short-circuit-swallow"), true);
        assertStrictEquals(ran.includes("short-circuit-never"), false);
        assertStrictEquals(result, undefined);
      } finally {
        odm.deleteInterceptor("short-circuit-swallow");
        odm.deleteInterceptor("short-circuit-never");
      }
    });
  },
});
