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
      const INTERCEPT_TEST_MODEL = "intercept_test";
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
  },
});
