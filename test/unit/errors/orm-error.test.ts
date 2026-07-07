import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../test_deps.ts";
import ORMError from "../../../src/errors/ORMError.ts";

describe({
  name: "ORMError",
  fn: () => {
    it("#generalError - throws with GENERAL code", () => {
      const error = assertThrows(() =>
        ORMError.generalError("boom")
      ) as ORMError;
      assertEquals(error.code, "GENERAL");
      assertEquals(error.message, "boom");
    });

    it("#generalError - carries an optional cause", () => {
      const cause = new Error("root cause");
      const error = assertThrows(() =>
        ORMError.generalError("boom", cause)
      ) as ORMError;
      assertEquals(error.cause, cause);
    });

    it("#databaseDoesNotExistsError - throws with DATABASE_DOES_NOT_EXISTS code", () => {
      const error = assertThrows(() =>
        ORMError.databaseDoesNotExistsError("mydb")
      ) as ORMError;
      assertEquals(error.code, "DATABASE_DOES_NOT_EXISTS");
      assertEquals(error.message, "Database mydb does not exist.");
    });

    it("#queryError - throws with QUERY code", () => {
      const error = assertThrows(() =>
        ORMError.queryError("bad query")
      ) as ORMError;
      assertEquals(error.code, "QUERY");
      assertEquals(error.message, "bad query");
    });

    it("#tableDefinitionValidationError - throws with TABLE_DEFINITION_VALIDATION code", () => {
      const cause = { columns: [] };
      const error = assertThrows(() =>
        ORMError.tableDefinitionValidationError(cause)
      ) as ORMError;
      assertEquals(error.code, "TABLE_DEFINITION_VALIDATION");
      assertEquals(error.cause, cause);
    });

    it("#recordValidationError - throws with RECORD_VALIDATION code", () => {
      const error = assertThrows(() =>
        ORMError.recordValidationError()
      ) as ORMError;
      assertEquals(error.code, "RECORD_VALIDATION");
    });

    it("is a real Error instance with the ORMError name", () => {
      const error = assertThrows(() => ORMError.generalError("boom"));
      assertEquals(error instanceof Error, true);
      assertEquals((error as Error).name, "ORMError");
    });
  },
});
