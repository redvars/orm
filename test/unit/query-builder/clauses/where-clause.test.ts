import { assertEquals, describe, it } from "../../../../test_deps.ts";
import WhereClause from "../../../../src/core/query-builder/CLAUSES/WhereClause.ts";

describe({
  name: "WhereClause",
  fn: () => {
    it("prepareStatement - empty when nothing has been added", () => {
      const clause = new WhereClause();
      assertEquals(clause.prepareStatement(), { sql: "", values: [] });
      assertEquals(clause.getCompoundExpression(), undefined);
    });

    it("#where - a single condition, prefixed with WHERE", () => {
      const clause = new WhereClause();
      clause.where("age", 10);
      assertEquals(clause.prepareStatement(), {
        sql: " WHERE %I = %L",
        values: ["age", 10],
      });
    });

    it("#andWhere - combines conditions with AND", () => {
      const clause = new WhereClause();
      clause.where("age", 10).andWhere("name", "Ada");
      assertEquals(clause.prepareStatement(), {
        sql: " WHERE (%I = %L AND %I = %L)",
        values: ["age", 10, "name", "Ada"],
      });
    });

    it("#orWhere - combines conditions with OR", () => {
      const clause = new WhereClause();
      clause.where("age", 10).orWhere("name", "Ada");
      assertEquals(clause.prepareStatement(), {
        sql: " WHERE (%I = %L OR %I = %L)",
        values: ["age", 10, "name", "Ada"],
      });
    });

    it("#andWhere - accepts a callback to build a nested compound expression", () => {
      const clause = new WhereClause();
      clause.where("age", 10).andWhere((sub) => {
        sub.where("name", "a1").orWhere("badge_number", "5");
      });
      assertEquals(clause.prepareStatement(), {
        sql: " WHERE (%I = %L AND (%I = %L OR %I = %L))",
        values: ["age", 10, "name", "a1", "badge_number", "5"],
      });
    });

    it("#toJSON - mirrors the compound expression's shape", () => {
      const clause = new WhereClause();
      clause.where("age", 10);
      assertEquals(clause.toJSON(), {
        firstExpression: { column: "age", operator: "=", value: 10 },
        remainingExpressions: [],
      });
    });
  },
});
