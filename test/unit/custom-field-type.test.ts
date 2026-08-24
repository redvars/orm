import { afterAll, assert, beforeAll, describe, it } from "../../test_deps.ts";

import {
  IDataType,
  type ORM,
  type ORMClient,
  type TColumnDataType,
  type TColumnDefinition,
} from "../../mod.ts";
import { Session } from "../test.utils.ts";

describe({
  name: "Custom FieldType",
  fn: () => {
    let odm: ORM;
    let client: ORMClient;
    const cleanTableList: string[] = [];

    const EMAIL_TYPE = "email";
    const EMAIL_FIELD = "email";
    const EMAIL_VALUE = "test@example.com";

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

    it("#addDataType - Registering Custom data type", async function () {
      class EmailType extends IDataType {
        constructor() {
          super("email");
        }

        getNativeType(_definition: TColumnDefinition): TColumnDataType {
          return "VARCHAR";
        }

        validateDefinition(_fieldDefinition: TColumnDefinition) {}

        setValueIntercept(newValue: any): any {
          return newValue;
        }

        getObjectIntercept(value: string | null): string | null {
          return value;
        }

        async validateValue(value: unknown): Promise<void> {
          const pattern = "(.+)@(.+){2,}\\.(.+){2,}";
          if (
            value &&
            typeof value === "string" &&
            !new RegExp(pattern).test(value)
          ) {
            throw new Error("Not a valid email");
          }
        }
      }

      odm.addDataType(new EmailType());

      try {
        await client.defineTable({
          name: "field_definition_test",
          columns: [
            {
              name: "name",
              type: "string",
            },
            {
              name: EMAIL_FIELD,
              type: EMAIL_TYPE,
            },
          ],
        });
        cleanTableList.push("field_definition_test");
        assert(true, "Custom field defined as expected");
      } catch (err) {
        console.error(err);
        assert(false, "Custom field not defined as expected");
      }
    });

    it("#registerFieldType -  creating record with custom field type", async () => {
      const collection = client.table("field_definition_test");
      const rec = collection.createNewRecord();
      rec.set("name", "RAM");
      rec.set(EMAIL_FIELD, EMAIL_VALUE);
      await rec.insert();

      const records = await collection
        .where(EMAIL_FIELD, "=", EMAIL_VALUE)
        .toArray();

      assert(
        records.length && records[0].get(EMAIL_FIELD) === EMAIL_VALUE,
        "Record created as expected",
      );
    });

    it("#registerFieldType -  creating record with invalid value", async () => {
      let error = false;
      try {
        const collection = client.table("field_definition_test");
        const rec = collection.createNewRecord();
        rec.set("name", "RAM");
        rec.set(EMAIL_FIELD, "TEST");
        await rec.insert();
      } catch (_err) {
        // No need to do anything
        error = true;
      }
      assert(error, "Able to create, invalid value");
    });

    // Note: "unrecognized column type causes defineTable() to reject" is
    // covered by schema/table-definition.test.ts's
    // "#ORM::defineTable - unknown field type" test - not duplicated here.
  },
});
