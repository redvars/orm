import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../../test_deps.ts";
import OrderByClause from "../../../../src/core/query-builder/CLAUSES/OrderByClause.ts";

describe({
  name: "OrderByClause",
  fn: () => {
    it("throws when no argument is given", () => {
      assertThrows(() => new OrderByClause());
    });

    it("defaults to ASC when no direction is given", () => {
      const clause = new OrderByClause("name");
      assertEquals(clause.prepareStatement(), {
        sql: " ORDER BY %I ASC",
        values: ["name"],
      });
    });

    it("accepts an explicit direction", () => {
      const clause = new OrderByClause("name", "DESC");
      assertEquals(clause.prepareStatement(), {
        sql: " ORDER BY %I DESC",
        values: ["name"],
      });
    });

    it("accepts an array of {column, order} entries", () => {
      const clause = new OrderByClause([
        { column: "age", order: "DESC" },
        { column: "name", order: "ASC" },
      ]);
      assertEquals(clause.prepareStatement(), {
        sql: " ORDER BY %I DESC, %I ASC",
        values: ["age", "name"],
      });
    });

    it("#toJSON - reflects the order-by list", () => {
      const clause = new OrderByClause("name", "DESC");
      assertEquals(clause.toJSON(), [{ column: "name", order: "DESC" }]);
    });
  },
});
