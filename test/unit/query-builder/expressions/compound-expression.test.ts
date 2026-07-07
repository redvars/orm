import { assertEquals, describe, it } from "../../../../test_deps.ts";
import CompoundExpression from "../../../../src/core/query-builder/EXPRESSIONS/CompoundExpression.ts";
import SimpleExpression from "../../../../src/core/query-builder/EXPRESSIONS/SimpleExpression.ts";

describe({
  name: "CompoundExpression",
  fn: () => {
    it("empty - produces no SQL", () => {
      const compound = new CompoundExpression();
      assertEquals(compound.prepareStatement(), { sql: "", values: [] });
    });

    it("a single expression is not wrapped in parentheses", () => {
      const compound = new CompoundExpression();
      compound.addExpression(new SimpleExpression("age", 10), "AND");
      assertEquals(compound.prepareStatement(), {
        sql: "%I = %L",
        values: ["age", 10],
      });
    });

    it("two expressions are joined by the operator and wrapped in parentheses", () => {
      const compound = new CompoundExpression();
      compound.addExpression(new SimpleExpression("age", 10), "AND");
      compound.addExpression(new SimpleExpression("name", "Ada"), "AND");
      assertEquals(compound.prepareStatement(), {
        sql: "(%I = %L AND %I = %L)",
        values: ["age", 10, "name", "Ada"],
      });
    });

    it("mixes AND/OR across more than two expressions in order", () => {
      const compound = new CompoundExpression();
      compound.addExpression(new SimpleExpression("age", 10), "AND");
      compound.addExpression(new SimpleExpression("name", "Ada"), "AND");
      compound.addExpression(new SimpleExpression("active", true), "OR");
      assertEquals(compound.prepareStatement(), {
        sql: "(%I = %L AND %I = %L OR %I = %L)",
        values: ["age", 10, "name", "Ada", "active", true],
      });
    });

    it("nests another compound expression", () => {
      const nested = new CompoundExpression();
      nested.addExpression(new SimpleExpression("name", "a1"), "AND");
      nested.addExpression(new SimpleExpression("badge_number", "5"), "OR");

      const outer = new CompoundExpression();
      outer.addExpression(new SimpleExpression("age", 10), "AND");
      outer.addExpression(nested, "AND");

      assertEquals(outer.prepareStatement(), {
        sql: "(%I = %L AND (%I = %L OR %I = %L))",
        values: ["age", 10, "name", "a1", "badge_number", "5"],
      });
    });

    it("#toJSON - reflects first + remaining expressions", () => {
      const compound = new CompoundExpression();
      compound.addExpression(new SimpleExpression("age", 10), "AND");
      compound.addExpression(new SimpleExpression("name", "Ada"), "AND");
      assertEquals(compound.toJSON(), {
        firstExpression: { column: "age", operator: "=", value: 10 },
        remainingExpressions: [
          {
            operator: "AND",
            expression: { column: "name", operator: "=", value: "Ada" },
          },
        ],
      });
    });
  },
});
