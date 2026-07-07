import {
  afterAll,
  assert,
  assertEquals,
  assertStrictEquals,
  beforeAll,
  describe,
  it,
} from "../../../test_deps.ts";

import { Session } from "../../test.utils.ts";
import type { ORM, ORMClient } from "../../../mod.ts";

describe({
  name: "Table Definition",
  fn: () => {
    let client: ORMClient;
    let odm: ORM;
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
      client.closeConnection();
    });

    it("#defineTable - simple", async () => {
      try {
        await client.defineTable({
          name: "person",
          columns: [
            {
              name: "name",
              type: "string",
            },
            {
              name: "dob",
              type: "date",
            },
            {
              name: "gender",
              type: "boolean",
            },
          ],
        });
        cleanTableList.push("person");
      } catch (_error) {
        assert(false, "Table has not been created");
      }
      assertEquals(odm.isTableDefined("person"), true, "Table should exists");
    });

    it("#defineTable - alter", async () => {
      try {
        client.deregisterTable("person");
        await client.defineTable({
          name: "person",
          columns: [
            {
              name: "name",
              type: "string",
            },
            {
              name: "dob",
              type: "date",
            },
            {
              name: "gender",
              type: "boolean",
            },
            {
              name: "color",
              type: "string",
            },
            {
              name: "phone_number",
              type: "string",
            },
          ],
        });
      } catch (_error) {
        assert(false, "Table has not been altered");
      }
      assertEquals(odm.isTableDefined("person"), true, "Table should exists");
    });

    it("#ORM::defineTable - unknown field type", async () => {
      try {
        await client.defineTable({
          name: "unknown",
          columns: [
            {
              name: "unknown",
              type: "unknown",
            },
          ],
        });
      } catch (error: any) {
        assertStrictEquals(
          error.cause.columns[0].name,
          "unknown",
          "Table not create as expected",
        );
      }
    });

    it("#ORM::defineTable - invalid name", async () => {
      try {
        await client.defineTable({
          name: "unknown",
          columns: [
            {
              name: "invalid name",
              type: "string",
            },
          ],
        });
      } catch (error: any) {
        assertStrictEquals(
          error.cause.columns[0].name,
          "invalid name",
          "Table not create as expected",
        );
      }
    });

    it("#defineTable - extends negative check", async () => {
      let assertValue = false;
      try {
        await client.defineTable({
          schema: "company",
          name: "employee",
          inherits: "person",
          final: true,
          columns: [
            {
              name: "name",
              type: "integer",
            },
            {
              name: "employee_id",
              type: "integer",
            },
          ],
        });
      } catch (_error) {
        assertValue = true;
      }
      assert(
        assertValue,
        "Table should not get extended, with duplicate field names",
      );
    });

    it("#defineTable - extends positive check", async () => {
      await client.defineTable({
        schema: "company",
        name: "employee",
        inherits: "person",
        final: true,
        columns: [
          {
            name: "employee_id",
            type: "integer",
          },
        ],
      });
      cleanTableList.push("company.employee");
      assert(true, "Table should get extended");
    });

    it("#defineTable - extends final negative check", async () => {
      let assertValue = false;
      try {
        await client.defineTable({
          name: "EXTEND_FINAL",
          inherits: "company.employee",
          columns: [
            {
              name: "address",
              type: "string",
            },
          ],
        });
      } catch (_error) {
        assertValue = true;
      }
      assert(assertValue, "Table should not extend, final schema");
    });
  },
});
