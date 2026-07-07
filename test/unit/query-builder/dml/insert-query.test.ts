import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../../test_deps.ts";
import InsertQuery from "../../../../src/core/query-builder/DML/InsertQuery.ts";

describe({
  name: "InsertQuery",
  fn: () => {
    it("builds an INSERT ... VALUES ... RETURNING statement", () => {
      const query = new InsertQuery();
      query.into("widget").columns(["name", "age"]).values([
        { name: "Ada", age: 30 },
      ]).returning("*");
      // %L quotes every literal value as a string, numbers included.
      assertEquals(
        query.buildQuery(),
        `INSERT into public.widget (name, age) VALUES ('Ada','30') RETURNING *`,
      );
    });

    it("supports inserting multiple rows", () => {
      const query = new InsertQuery();
      query.into("widget").columns(["name"]).values([
        { name: "Ada" },
        { name: "Grace" },
      ]);
      const sql = query.buildQuery();
      assertEquals(sql.match(/VALUES/g)?.length, 2);
    });

    it("throws when the table name is missing", () => {
      const query = new InsertQuery();
      query.columns(["name"]).values([{ name: "Ada" }]);
      assertThrows(() => query.buildQuery());
    });

    it("throws when values are missing but columns are declared", () => {
      const query = new InsertQuery();
      query.into("widget").columns(["name"]);
      assertThrows(() => query.buildQuery());
    });
  },
});
