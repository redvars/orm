import { assertEquals, describe, it } from "../../../test_deps.ts";
import { RecordSaveError } from "../../../src/errors/RecordSaveError.ts";
import { FieldValidationError } from "../../../src/errors/FieldValidationError.ts";
import type { TTableDefinitionStrict } from "../../../src/types.ts";

function makeTableDefinition(): TTableDefinitionStrict {
  return {
    schema: "public",
    name: "widget",
    final: false,
    columns: [],
    unique: [],
    index: [],
    renames: {},
    allowDestructiveMigrations: false,
  };
}

describe({
  name: "RecordSaveError",
  fn: () => {
    it("#toJSON - exposes tableDefinition, recordId, and mapped fieldErrors", () => {
      const tableDefinition = makeTableDefinition();
      const fieldError = new FieldValidationError(
        {
          name: "email",
          type: "string",
          not_null: false,
          default: null,
          unique: false,
          index: false,
        },
        "not-an-email",
        "INVALID_FORMAT",
      );
      const error = new RecordSaveError(
        tableDefinition,
        "record-1",
        [fieldError],
      );
      assertEquals(error.toJSON(), {
        tableDefinition,
        recordId: "record-1",
        fieldErrors: [fieldError.toJSON()],
      });
      assertEquals(error.name, "RecordValidationError");
    });

    it("uses the provided message override when given", () => {
      const error = new RecordSaveError(
        makeTableDefinition(),
        "record-1",
        [],
        "custom message",
      );
      assertEquals(
        error.message,
        "Record validation error in table widget with id record-1. custom message",
      );
    });
  },
});
