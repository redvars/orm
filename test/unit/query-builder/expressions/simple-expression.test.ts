import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../../test_deps.ts";
import SimpleExpression from "../../../../src/core/query-builder/EXPRESSIONS/SimpleExpression.ts";

describe({
  name: "SimpleExpression",
  fn: () => {
    it("defaults an omitted operator to '='", () => {
      const expression = new SimpleExpression("age", 10);
      assertEquals(expression.prepareStatement(), {
        sql: "%I = %L",
        values: ["age", 10],
      });
    });

    it("accepts an explicit operator", () => {
      const expression = new SimpleExpression("age", ">", 10);
      assertEquals(expression.prepareStatement(), {
        sql: "%I > %L",
        values: ["age", 10],
      });
    });

    it("array shorthand: where(col, [1,2]) becomes IN", () => {
      const expression = new SimpleExpression("id", [1, 2]);
      assertEquals(expression.prepareStatement(), {
        sql: "%I IN (%L)",
        values: ["id", [1, 2]],
      });
    });

    it("explicit IN / NOT IN operators", () => {
      const inExpr = new SimpleExpression("id", "IN", [1, 2]);
      assertEquals(inExpr.prepareStatement(), {
        sql: "%I IN (%L)",
        values: ["id", [1, 2]],
      });

      const notInExpr = new SimpleExpression("id", "NOT IN", [1, 2]);
      assertEquals(notInExpr.prepareStatement(), {
        sql: "%I NOT IN (%L)",
        values: ["id", [1, 2]],
      });
    });

    it("= null becomes IS NULL", () => {
      const expression = new SimpleExpression("deleted_at", "=", null);
      assertEquals(expression.prepareStatement(), {
        sql: "%I IS NULL",
        values: ["deleted_at"],
      });
    });

    it("!= null and <> null become IS NOT NULL", () => {
      const notEq = new SimpleExpression("deleted_at", "!=", null);
      assertEquals(notEq.prepareStatement(), {
        sql: "%I IS NOT NULL",
        values: ["deleted_at"],
      });

      const diamond = new SimpleExpression("deleted_at", "<>", null);
      assertEquals(diamond.prepareStatement(), {
        sql: "%I IS NOT NULL",
        values: ["deleted_at"],
      });
    });

    it("explicit IS TRUE / IS FALSE / IS UNKNOWN (no-value operators)", () => {
      const isTrue = new SimpleExpression("active", "IS TRUE");
      assertEquals(isTrue.prepareStatement(), {
        sql: "%I IS TRUE",
        values: ["active"],
      });

      const isFalse = new SimpleExpression("active", "IS FALSE");
      assertEquals(isFalse.prepareStatement(), {
        sql: "%I IS FALSE",
        values: ["active"],
      });
    });

    it("column === true/false shorthand becomes 1 = 1 / 1 = 0", () => {
      const whereTrue = new SimpleExpression(true, undefined);
      assertEquals(whereTrue.prepareStatement(), {
        sql: "%L = %L",
        values: [1, 1],
      });

      const whereFalse = new SimpleExpression(false, undefined);
      assertEquals(whereFalse.prepareStatement(), {
        sql: "%L = %L",
        values: [1, 0],
      });
    });

    it("throws for an invalid operator", () => {
      assertThrows(() => new SimpleExpression("age", "??", 10));
    });

    it("throws when an array-value operator is given a non-array value", () => {
      assertThrows(() => new SimpleExpression("id", "IN", 1));
    });

    it("#toJSON - reflects column/operator/value", () => {
      const expression = new SimpleExpression("age", ">", 10);
      assertEquals(expression.toJSON(), {
        column: "age",
        operator: ">",
        value: 10,
      });
    });
  },
});
