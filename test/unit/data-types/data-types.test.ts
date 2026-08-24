import {
  afterAll,
  assert,
  assertEquals,
  assertRejects,
  beforeAll,
  describe,
  it,
} from "../../../test_deps.ts";
import { Session } from "../../test.utils.ts";
import type { ORMClient } from "../../../mod.ts";

import BooleanDataType from "../../../src/data-types/types/BooleanDataType.ts";
import CharDataType from "../../../src/data-types/types/CharDataType.ts";
import DateDataType from "../../../src/data-types/types/DateDataType.ts";
import DateTimeDataType from "../../../src/data-types/types/DateTimeDataType.ts";
import IntegerDataType from "../../../src/data-types/types/IntegerDataType.ts";
import JSONDataType from "../../../src/data-types/types/JSONDataType.ts";
import NumberDataType from "../../../src/data-types/types/NumberDataType.ts";
import StringDataType from "../../../src/data-types/types/StringDataType.ts";
import TimeDataType from "../../../src/data-types/types/TimeDataType.ts";
import UUIDDataType from "../../../src/data-types/types/UUIDDataType.ts";

describe({
  name: "Built-in data types",
  fn: () => {
    describe({
      name: "round-trip via a real table",
      fn: () => {
        let client: ORMClient;
        const cleanTableList: string[] = [];

        beforeAll(async () => {
          client = await Session.getClient();
          await client.defineTable({
            name: "data_type_probe",
            columns: [
              { name: "flag", type: "boolean" },
              { name: "code", type: "char" },
              { name: "day", type: "date" },
              { name: "moment", type: "datetime" },
              { name: "count", type: "integer" },
              { name: "payload", type: "json" },
              { name: "amount", type: "number" },
              { name: "label", type: "string" },
              { name: "clock", type: "time" },
              { name: "ref", type: "uuid" },
            ],
          });
          cleanTableList.push("data_type_probe");
        });

        afterAll(async () => {
          const client = await Session.getClient();
          for (const table of cleanTableList) {
            await client.dropTable(table);
          }
          client.closeConnection();
        });

        it("round-trips a representative value for every built-in type", async () => {
          const table = client.table("data_type_probe");
          const record = table.createNewRecord();
          record.set("flag", true);
          record.set("code", "A");
          record.set("day", "2024-01-15");
          record.set("moment", "2024-01-15T10:30:00");
          record.set("count", 42);
          record.set("payload", { nested: true });
          record.set("amount", 3.5);
          record.set("label", "hello");
          record.set("clock", "10:30:00");
          record.set("ref", "550e8400-e29b-41d4-a716-446655440000");
          await record.insert();

          const found = await table.getRecord(record.getID());
          assert(found, "Expected to find the inserted record");

          assertEquals(found!.get("flag"), true);
          assertEquals(found!.get("code"), "A");
          assertEquals(found!.get("day"), "2024-01-15");
          // DateTimeDataType's JSON form treats the (timezone-less) wall
          // clock value as UTC, producing a full ISO instant.
          assertEquals(found!.get("moment"), "2024-01-15T10:30:00Z");
          assertEquals(found!.get("count"), 42);
          assertEquals(found!.get("payload"), { nested: true });
          assertEquals(found!.get("amount"), 3.5);
          assertEquals(found!.get("label"), "hello");
          assertEquals(found!.get("clock"), "10:30:00");
          assertEquals(
            found!.get("ref"),
            "550e8400-e29b-41d4-a716-446655440000",
          );

          assertEquals(found!.getObject("day").toString(), "2024-01-15");
          assertEquals(
            found!.getObject("moment").toString(),
            "2024-01-15T10:30:00",
          );
          assertEquals(found!.getObject("clock").toString(), "10:30:00");
        });

        it("regression: 'char' and 'string' now resolve to distinct data types", async () => {
          // CharDataType and StringDataType used to both register under
          // "string", so "char" silently fell back to StringDataType.
          // Confirm the physical column types now differ.
          const rows = await client.query().execute(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'data_type_probe' AND column_name IN ('code', 'label') ORDER BY column_name;`,
          );
          const byColumn = Object.fromEntries(
            rows.map((r: any) => [r.column_name, r.data_type]),
          );
          assertEquals(byColumn.code, "character");
          assertEquals(byColumn.label, "character varying");
        });

        it("regression: midnight date/time values (all-zero fields) round-trip correctly", async () => {
          // date/datetime/time values crossing midnight (day/hour/minute/
          // second all 0) previously either shifted by the local UTC offset
          // (a real bug on any server timezone ahead of UTC) or, briefly
          // during the fix, tripped a Deno Temporal polyfill quirk that
          // rejects an explicit 0 in the object-literal from({...}) form.
          const table = client.table("data_type_probe");
          const record = table.createNewRecord();
          record.set("day", "2024-03-01");
          record.set("moment", "2024-03-01T00:00:00");
          record.set("clock", "00:00:00");
          await record.insert();

          const found = await table.getRecord(record.getID());
          assert(found, "Expected to find the inserted record");
          assertEquals(found!.getObject("day").toString(), "2024-03-01");
          assertEquals(
            found!.getObject("moment").toString(),
            "2024-03-01T00:00:00",
          );
          assertEquals(found!.getObject("clock").toString(), "00:00:00");
        });
      },
    });

    describe({
      name: "validateValue - invalid values are rejected",
      fn: () => {
        it("IntegerDataType", async () => {
          await assertRejects(() =>
            new IntegerDataType().validateValue("not-a-number")
          );
        });

        it("NumberDataType", async () => {
          await assertRejects(() =>
            new NumberDataType().validateValue("not-a-number")
          );
        });

        it("JSONDataType", async () => {
          await assertRejects(() =>
            new JSONDataType().validateValue("not-an-object-or-null")
          );
        });

        it("UUIDDataType", async () => {
          await assertRejects(() =>
            new UUIDDataType().validateValue("not-a-uuid")
          );
        });
      },
    });

    describe({
      name: "setValueIntercept - edge cases",
      fn: () => {
        it("BooleanDataType - coerces string/number to boolean", () => {
          const type = new BooleanDataType();
          assertEquals(type.setValueIntercept("true"), true);
          assertEquals(type.setValueIntercept("false"), false);
          assertEquals(type.setValueIntercept(1), true);
          assertEquals(type.setValueIntercept(0), false);
        });

        it("IntegerDataType - parses numeric strings", () => {
          const type = new IntegerDataType();
          assertEquals(type.setValueIntercept("42"), 42);
          assertEquals(type.setValueIntercept(42), 42);
          assertEquals(type.setValueIntercept(null), null);
        });

        it("NumberDataType - coerces numeric strings", () => {
          const type = new NumberDataType();
          assertEquals(type.setValueIntercept("3.5"), 3.5);
          assertEquals(type.setValueIntercept(3.5), 3.5);
        });

        it("StringDataType / CharDataType - stringify non-null values", () => {
          const stringType = new StringDataType();
          assertEquals(stringType.setValueIntercept(42), "42");
          assertEquals(stringType.setValueIntercept(null), null);

          const charType = new CharDataType();
          assertEquals(charType.setValueIntercept(42), "42");
          assertEquals(charType.setValueIntercept(null), null);
        });

        it("DateDataType - parses an ISO string and a Date", () => {
          // The declared param type is Temporal.PlainDate | null, but the
          // runtime also accepts string/Date (as Record.set() relies on) -
          // the type signature just doesn't say so.
          const type = new DateDataType();
          const fromString = type.setValueIntercept("2024-01-15" as any);
          assertEquals(fromString?.toString(), "2024-01-15");

          const fromDate = type.setValueIntercept(
            new Date("2024-01-15T00:00:00.000Z") as any,
          );
          assertEquals(fromDate?.toString(), "2024-01-15");
        });

        it("DateTimeDataType - parses an ISO string", () => {
          // DateTimeDataType's JSON form treats the (timezone-less) wall
          // clock value as UTC, producing a full ISO instant.
          const type = new DateTimeDataType();
          const fromString = type.setValueIntercept(
            "2024-01-15T10:30:00" as any,
          );
          assertEquals(fromString, "2024-01-15T10:30:00Z");
        });

        it("TimeDataType - parses a time string, a Date, and passes null through", () => {
          const type = new TimeDataType();
          const fromString = type.setValueIntercept("10:30:00" as any);
          assertEquals(fromString?.toString(), "10:30:00");

          // Constructed from local field getters (not UTC), so build the
          // Date via its local constructor to keep this assertion
          // independent of the machine's timezone.
          const fromDate = type.setValueIntercept(
            new Date(2024, 0, 15, 10, 30, 0),
          );
          assertEquals(fromDate?.toString(), "10:30:00");

          assertEquals(type.setValueIntercept(null), null);
        });

        it("TimeDataType - getObjectIntercept parses a JSON string into a PlainTime and passes null through", () => {
          const type = new TimeDataType();
          assertEquals(type.getObjectIntercept("10:30:00")?.toString(), "10:30:00");
          assertEquals(type.getObjectIntercept(null), null);
        });

        it("UUIDDataType / JSONDataType - pass values through unchanged", () => {
          const uuidType = new UUIDDataType();
          assertEquals(
            uuidType.setValueIntercept(
              "550e8400-e29b-41d4-a716-446655440000",
            ),
            "550e8400-e29b-41d4-a716-446655440000",
          );

          const jsonType = new JSONDataType();
          const value = { nested: true };
          assertEquals(jsonType.setValueIntercept(value), value);
        });
      },
    });

    describe({
      name: "getDisplayValue - optional display formatting",
      fn: () => {
        it("defaults to the JSON representation, and empty string for null", () => {
          const stringType = new StringDataType();
          assertEquals(stringType.getDisplayValue("hello"), "hello");
          assertEquals(stringType.getDisplayValue(null), "");

          const dateType = new DateDataType();
          const date = Temporal.PlainDate.from("2024-01-15");
          assertEquals(dateType.getDisplayValue(date), "2024-01-15");
        });
      },
    });
  },
});
