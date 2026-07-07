import { assertEquals, describe, it } from "../../../../test_deps.ts";
import SelectQuery from "../../../../src/core/query-builder/DQL/SelectQuery.ts";

describe({
  name: "SelectQuery",
  fn: () => {
    it("builds a plain single-table SELECT", () => {
      const query = new SelectQuery();
      query.columns(["name", "age"]).from("widget").where("age", 10);
      // Plain lowercase identifiers render unquoted - pg-format's %I only
      // quotes when actually necessary (reserved words, mixed case, etc).
      assertEquals(
        query.buildQuery(),
        `SELECT name, age FROM public.widget WHERE age = '10'`,
      );
    });

    it("applies ORDER BY / LIMIT / OFFSET on a single table", () => {
      const query = new SelectQuery();
      query.columns("*").from("widget").orderBy("name", "DESC").limit(5)
        .offset(2);
      assertEquals(
        query.buildQuery(),
        `SELECT * FROM public.widget ORDER BY name DESC LIMIT 5 OFFSET 2`,
      );
    });

    it("builds a UNION ALL across multiple tables, applying ORDER BY/LIMIT once at the outer level", () => {
      const query = new SelectQuery();
      query.columns(["name"]).from(["parent", "child"]).where("active", true)
        .orderBy("name").limit(10);
      const sql = query.buildQuery();
      assertEquals((sql.match(/UNION ALL/g) || []).length, 1);
      assertEquals((sql.match(/ORDER BY/g) || []).length, 1);
      assertEquals((sql.match(/LIMIT/g) || []).length, 1);
      assertEquals(sql.includes("public.parent"), true);
      assertEquals(sql.includes("public.child"), true);
    });

    it("#buildCountQuery - wraps buildQuery in a COUNT(*)", () => {
      const query = new SelectQuery();
      query.columns("*").from("widget");
      assertEquals(
        query.buildCountQuery(),
        `SELECT COUNT(*) as count FROM (SELECT * FROM public.widget) as t`,
      );
    });
  },
});
