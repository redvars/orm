import {
  afterAll,
  assert,
  assertEquals,
  describe,
  it,
} from "../../../test_deps.ts";
import { ORM } from "../../../mod.ts";
import type { UUID4 } from "../../../mod.ts";
import IDataType from "../../../src/data-types/IDataType.ts";
import RecordInterceptor from "../../../src/operation-interceptor/RecordInterceptor.ts";
import { defaultConfig } from "../../test.utils.ts";

describe({
  name: "ORM",
  fn: () => {
    const database = "orm-test-orm-suite";

    afterAll(async () => {
      const client = await new ORM({ ...defaultConfig, database }).connect(
        true,
      );
      await client.dropDatabase();
    });

    it("#connect - creates the database when it does not exist", async () => {
      const odm = new ORM({ ...defaultConfig, database });
      const client = await odm.connect(true);
      await client.testConnection();
      client.closeConnection();
    });

    it("#isTableDefined - reflects registered/unregistered tables", async () => {
      const odm = new ORM({ ...defaultConfig, database });
      const client = await odm.connect(true);
      try {
        assertEquals(odm.isTableDefined("orm_test_widget"), false);
        await client.defineTable({
          name: "orm_test_widget",
          columns: [{ name: "name", type: "string" }],
        });
        assertEquals(odm.isTableDefined("orm_test_widget"), true);
      } finally {
        client.closeConnection();
      }
    });

    it("#addDataType - registers a custom data type usable by defineTable", async () => {
      const odm = new ORM({ ...defaultConfig, database });

      class UpperCaseType extends IDataType {
        constructor() {
          super("uppercase");
        }
        getNativeType() {
          return "VARCHAR" as const;
        }
        validateDefinition() {}
        setValueIntercept(value: string | null) {
          return value === null ? null : value.toUpperCase();
        }
        getObjectIntercept(value: string | null) {
          return value;
        }
        async validateValue() {}
      }
      odm.addDataType(new UpperCaseType());

      const client = await odm.connect(true);
      try {
        await client.defineTable({
          name: "orm_test_shout",
          columns: [{ name: "text", type: "uppercase" }],
        });
        const record = client.table("orm_test_shout").createNewRecord();
        record.set("text", "hello");
        assertEquals(record.get("text"), "HELLO");
      } finally {
        client.closeConnection();
      }
    });

    it("#addInterceptor / #deleteInterceptor - register and remove a record interceptor", async () => {
      const odm = new ORM({ ...defaultConfig, database });
      let calls = 0;

      class CountingInterceptor extends RecordInterceptor {
        getName() {
          return "orm-test-counting-interceptor";
        }
        async intercept(_table: any, _operation: any, records: any[]) {
          calls++;
          return records;
        }
      }
      odm.addInterceptor(new CountingInterceptor());

      const client = await odm.connect(true);
      try {
        await client.defineTable({
          name: "orm_test_note",
          columns: [{ name: "text", type: "string" }],
        });

        const record = client.table("orm_test_note").createNewRecord();
        record.set("text", "hi");
        await record.insert();
        assert(calls > 0, "interceptor should have run on insert");

        odm.deleteInterceptor("orm-test-counting-interceptor");
        const callsBeforeSecondInsert = calls;

        const secondRecord = client.table("orm_test_note").createNewRecord();
        secondRecord.set("text", "hi again");
        await secondRecord.insert();
        assertEquals(
          calls,
          callsBeforeSecondInsert,
          "interceptor should no longer run after deleteInterceptor",
        );
      } finally {
        client.closeConnection();
      }
    });

    it("static #generateRecordId / #isValidRecordId", () => {
      const id = ORM.generateRecordId();
      assert(ORM.isValidRecordId(id));
      assert(!ORM.isValidRecordId("not-a-uuid" as UUID4));
    });
  },
});
