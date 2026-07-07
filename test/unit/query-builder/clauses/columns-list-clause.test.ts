import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../../test_deps.ts";
import ColumnsListClause from "../../../../src/core/query-builder/CLAUSES/ColumnsListClause.ts";

describe({
  name: "ColumnsListClause",
  fn: () => {
    it("defaults to '*' when no argument is given", () => {
      const clause = new ColumnsListClause();
      assertEquals(clause.prepareStatement(), { sql: "%s", values: ["*"] });
    });

    it("accepts a single column name", () => {
      const clause = new ColumnsListClause("name");
      assertEquals(clause.prepareStatement(), { sql: "%I", values: ["name"] });
    });

    it("accepts a column name plus trailing columns", () => {
      const clause = new ColumnsListClause("name", "age");
      assertEquals(clause.prepareStatement(), {
        sql: "%I, %I",
        values: ["name", "age"],
      });
    });

    it("accepts an array of column names", () => {
      const clause = new ColumnsListClause(["name", "age"]);
      assertEquals(clause.prepareStatement(), {
        sql: "%I, %I",
        values: ["name", "age"],
      });
    });

    it("accepts a {column: true} map, using its keys", () => {
      const clause = new ColumnsListClause({ name: true, age: true });
      assertEquals(clause.prepareStatement(), {
        sql: "%I, %I",
        values: ["name", "age"],
      });
    });

    it("passes aggregate function expressions through unquoted (%s, not %I)", () => {
      const clause = new ColumnsListClause("count(*) as count");
      assertEquals(clause.prepareStatement(), {
        sql: "%s",
        values: ["count(*) as count"],
      });
    });

    it("throws when a column entry is an object", () => {
      assertThrows(() => new ColumnsListClause([{ nested: true } as any]));
    });
  },
});
