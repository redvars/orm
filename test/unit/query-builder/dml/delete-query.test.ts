import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../../test_deps.ts";
import DeleteQuery from "../../../../src/core/query-builder/DML/DeleteQuery.ts";

describe({
  name: "DeleteQuery",
  fn: () => {
    it("builds a DELETE FROM ... WHERE statement", () => {
      const query = new DeleteQuery();
      query.from("widget").where("id", "1");
      // Plain lowercase identifiers render unquoted - pg-format's %I only
      // quotes when actually necessary (reserved words, mixed case, etc).
      assertEquals(
        query.buildQuery(),
        `DELETE FROM public.widget WHERE id = '1'`,
      );
    });

    it("supports orWhere", () => {
      const query = new DeleteQuery();
      query.from("widget").where("id", "1").orWhere("id", "2");
      assertEquals(
        query.buildQuery(),
        `DELETE FROM public.widget WHERE (id = '1' OR id = '2')`,
      );
    });

    it("supports no where condition (deletes all rows)", () => {
      const query = new DeleteQuery();
      query.from("widget");
      assertEquals(query.buildQuery(), `DELETE FROM public.widget`);
    });

    it("throws when the table name is missing", () => {
      const query = new DeleteQuery();
      assertThrows(() => query.buildQuery());
    });
  },
});
