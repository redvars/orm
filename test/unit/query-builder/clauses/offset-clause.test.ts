import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../../test_deps.ts";
import OffsetClause from "../../../../src/core/query-builder/CLAUSES/OffsetClause.ts";

describe({
  name: "OffsetClause",
  fn: () => {
    it("builds an OFFSET clause for a valid offset", () => {
      const clause = new OffsetClause(10);
      assertEquals(clause.prepareStatement(), {
        sql: " OFFSET 10",
        values: [],
      });
    });

    it("allows an offset of 0", () => {
      const clause = new OffsetClause(0);
      assertEquals(clause.prepareStatement(), {
        sql: " OFFSET 0",
        values: [],
      });
    });

    it("throws for a negative offset", () => {
      assertThrows(() => new OffsetClause(-1));
    });

    it("throws for a NaN offset", () => {
      assertThrows(() => new OffsetClause(NaN));
    });

    it("#toJSON - reflects the offset", () => {
      const clause = new OffsetClause(5);
      assertEquals(clause.toJSON(), { offset: 5 });
    });
  },
});
