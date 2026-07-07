import { assertEquals, describe, it } from "../../../test_deps.ts";
import TableDefinitionError from "../../../src/errors/TableDefinitionError.ts";

describe({
  name: "TableDefinitionError",
  fn: () => {
    it("carries the table name in its message and the cause object", () => {
      const cause = { columns: [{ name: "name", message: "bad" }] };
      const error = new TableDefinitionError("widget", cause);
      assertEquals(error.message, "Table definition error: widget");
      assertEquals(error.code, "TABLE_DEFINITION_VALIDATION");
      assertEquals(error.cause, cause);
      assertEquals(error instanceof Error, true);
    });
  },
});
