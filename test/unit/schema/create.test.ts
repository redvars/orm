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
  name: "CREATE Query",
  fn: () => {
    let client: ORMClient;
    let odm: ORM;
    const logger = Session.getLogger();
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

    it("#table - negative check", function () {
      try {
        client.table("unknown_table");
        assert(false, "Table should not exists");
      } catch (error: any) {
        assertStrictEquals(
          error.code,
          "TABLE_DEFINITION_VALIDATION",
          "Table should not exists",
        );
      }
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

    it("#table - normal schema record", async () => {
      let assertValue = false;
      try {
        const personTable = client.table("person");
        const personRecord = personTable.createNewRecord();
        await personRecord.insert();
        assertValue = true;
      } catch (error: any) {
        logger.error(error.message);
      }
      assert(assertValue);
    });

    it("#table - extends schema record", async () => {
      let assertValue = false;
      try {
        const employeeTable = client.table("company.employee");
        const employeeRecord = employeeTable.createNewRecord();
        await employeeRecord.insert();
        assertValue = true;
      } catch (error: any) {
        logger.error(error.message);
      }
      assert(assertValue);
    });

    it("#table - polymorphic read across hierarchy (UNION ALL)", async () => {
      await client.defineTable({
        name: "vehicle",
        columns: [
          {
            name: "make",
            type: "string",
          },
        ],
      });
      cleanTableList.push("vehicle");

      const vehicleTable = client.table("vehicle");
      const car = vehicleTable.createNewRecord();
      car.set("make", "Toyota");
      await car.insert();

      await client.defineTable({
        name: "truck",
        inherits: "vehicle",
        final: true,
        columns: [
          {
            name: "payload_capacity",
            type: "integer",
          },
        ],
      });
      cleanTableList.push("truck");

      const truckTable = client.table("truck");
      const truck = truckTable.createNewRecord();
      truck.set("make", "Ford");
      truck.set("payload_capacity", 1000);
      await truck.insert();

      const records = await client.table("vehicle").toArray();
      assertStrictEquals(
        records.length,
        2,
        "Expected 2 rows across vehicle+truck",
      );

      const makes = records.map((record) => record.get("make")).sort();
      assertEquals(makes, ["Ford", "Toyota"]);

      for (const record of records) {
        assertStrictEquals(
          record.get("payload_capacity"),
          null,
          "vehicle-scoped record should not expose truck-only columns",
        );
      }

      const count = await client.table("vehicle").count();
      assertStrictEquals(
        count,
        2,
        "count() should also reflect UNION ALL of both tables",
      );
    });

    it("#defineTable - alter propagates new column to existing descendant table", async () => {
      await client.defineTable({
        name: "shape",
        columns: [
          {
            name: "label",
            type: "string",
          },
        ],
      });
      cleanTableList.push("shape");

      await client.defineTable({
        name: "circle",
        inherits: "shape",
        final: true,
        columns: [
          {
            name: "radius",
            type: "integer",
          },
        ],
      });
      cleanTableList.push("circle");

      client.deregisterTable("shape");
      await client.defineTable({
        name: "shape",
        columns: [
          {
            name: "label",
            type: "string",
          },
          {
            name: "color",
            type: "string",
          },
        ],
      });

      const circleTable = client.table("circle");
      const circleRecord = circleTable.createNewRecord();
      circleRecord.set("label", "c1");
      circleRecord.set("color", "red");
      circleRecord.set("radius", 5);
      await circleRecord.insert();

      const found = await client.table("circle").getRecord({ label: "c1" });
      assertStrictEquals(
        found?.get("color"),
        "red",
        "New ancestor column should exist and be settable on descendant table",
      );
    });

    it("#record - update/delete route to the concrete owning table", async () => {
      await client.defineTable({
        name: "instrument",
        columns: [
          {
            name: "name",
            type: "string",
          },
        ],
      });
      cleanTableList.push("instrument");

      await client.defineTable({
        name: "guitar",
        inherits: "instrument",
        final: true,
        columns: [
          {
            name: "strings",
            type: "integer",
          },
        ],
      });
      cleanTableList.push("guitar");

      const guitarTable = client.table("guitar");
      const guitar = guitarTable.createNewRecord();
      guitar.set("name", "Stratocaster");
      guitar.set("strings", 6);
      await guitar.insert();

      const instrumentTable = client.table("instrument");
      const fetched = await instrumentTable.getRecord({
        name: "Stratocaster",
      });
      assert(fetched, "Expected to find the guitar row via the ancestor table");

      fetched!.set("name", "Stratocaster Updated");
      await fetched!.update();

      const guitarAfterUpdate = await client.table("guitar").getRecord({
        name: "Stratocaster Updated",
      });
      assert(
        guitarAfterUpdate,
        "Update should have reached the concrete 'guitar' table",
      );
      assertStrictEquals(guitarAfterUpdate!.get("strings"), 6);

      await fetched!.delete();

      const guitarAfterDelete = await client.table("guitar").getRecord({
        id: fetched!.getID(),
      });
      assertStrictEquals(
        guitarAfterDelete,
        undefined,
        "Delete should have removed the row from the concrete 'guitar' table",
      );
    });
  },
});
