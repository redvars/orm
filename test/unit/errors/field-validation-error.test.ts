import { assertEquals, describe, it } from "../../../test_deps.ts";
import { FieldValidationError } from "../../../src/errors/FieldValidationError.ts";
import type { TColumnDefinitionStrict } from "../../../src/types.ts";

function makeColumnDefinition(): TColumnDefinitionStrict {
  return {
    name: "email",
    type: "string",
    not_null: false,
    default: null,
    unique: false,
    index: false,
  };
}

describe({
  name: "FieldValidationError",
  fn: () => {
    it("#toJSON - exposes code, columnDefinition, and value", () => {
      const columnDefinition = makeColumnDefinition();
      const error = new FieldValidationError(
        columnDefinition,
        "not-an-email",
        "INVALID_FORMAT",
      );
      assertEquals(error.toJSON(), {
        code: "INVALID_FORMAT",
        columnDefinition,
        value: "not-an-email",
      });
      assertEquals(error.name, "FieldValidationError");
      assertEquals(error instanceof Error, true);
    });
  },
});
