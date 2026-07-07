import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../../test_deps.ts";
import LimitClause from "../../../../src/core/query-builder/CLAUSES/LimitClause.ts";

describe({
  name: "LimitClause",
  fn: () => {
    it("builds a LIMIT clause for a valid limit", () => {
      const clause = new LimitClause(10);
      assertEquals(clause.prepareStatement(), {
        sql: " LIMIT 10",
        values: [],
      });
    });

    it("allows a limit of 0", () => {
      const clause = new LimitClause(0);
      assertEquals(clause.prepareStatement(), { sql: " LIMIT 0", values: [] });
    });

    it("throws for a negative limit", () => {
      assertThrows(() => new LimitClause(-1));
    });

    it("throws for a NaN limit", () => {
      assertThrows(() => new LimitClause(NaN));
    });

    it("#toJSON - reflects the limit", () => {
      const clause = new LimitClause(5);
      assertEquals(clause.toJSON(), { limit: 5 });
    });
  },
});
