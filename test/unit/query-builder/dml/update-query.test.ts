import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../../test_deps.ts";
import UpdateQuery from "../../../../src/core/query-builder/DML/UpdateQuery.ts";

describe({
  name: "UpdateQuery",
  fn: () => {
    it("builds an UPDATE ... SET ... WHERE statement using set(col, value)", () => {
      const query = new UpdateQuery();
      query.into("widget").set("name", "Ada").where("id", "1");
      assertEquals(
        query.buildQuery(),
        `UPDATE public.widget SET name = 'Ada' WHERE id = '1'`,
      );
    });

    it("builds a SET clause using the set(record) form", () => {
      const query = new UpdateQuery();
      query.into("widget").set({ name: "Ada", age: 30 }).where("id", "1");
      assertEquals(
        query.buildQuery(),
        `UPDATE public.widget SET name = 'Ada', age = '30' WHERE id = '1'`,
      );
    });

    it("supports #returning", () => {
      const query = new UpdateQuery();
      query.into("widget").set("name", "Ada").where("id", "1").returning("*");
      assertEquals(query.buildQuery().endsWith("RETURNING *"), true);
    });

    it("throws when the table name is missing", () => {
      const query = new UpdateQuery();
      query.set("name", "Ada");
      assertThrows(() => query.buildQuery());
    });

    it("throws when no SET values are provided", () => {
      const query = new UpdateQuery();
      query.into("widget").where("id", "1");
      assertThrows(() => query.buildQuery());
    });
  },
});
