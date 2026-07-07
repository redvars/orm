import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../../test_deps.ts";
import { pgFormat } from "../../../../deps.ts";
import GroupByClause from "../../../../src/core/query-builder/CLAUSES/GroupByClause.ts";

describe({
  name: "GroupByClause",
  fn: () => {
    it("throws when no argument is given", () => {
      assertThrows(() => new GroupByClause());
    });

    it("accepts a single column name", () => {
      const clause = new GroupByClause("department");
      assertEquals(clause.prepareStatement(), {
        sql: " GROUP BY %I",
        values: [["department"]],
      });
    });

    it("accepts an array of column names", () => {
      const clause = new GroupByClause(["department", "role"]);
      assertEquals(clause.prepareStatement(), {
        sql: " GROUP BY %I",
        values: [["department", "role"]],
      });
    });

    it("accepts a {column: true} map, using its keys", () => {
      const clause = new GroupByClause({ department: true, role: true });
      assertEquals(clause.prepareStatement(), {
        sql: " GROUP BY %I",
        values: [["department", "role"]],
      });
    });

    it("throws when a column entry is an object", () => {
      assertThrows(() => new GroupByClause([{ nested: true } as any]));
    });

    it("regression: renders every column, not just the first, when there are multiple", () => {
      // GroupByClause used to push its column list as separate positional
      // args instead of a single array value, so pg-format silently dropped
      // every column after the first.
      const clause = new GroupByClause("department", "role");
      const { sql, values } = clause.prepareStatement();
      assertEquals(pgFormat(sql, ...values), " GROUP BY department,role");
    });
  },
});
