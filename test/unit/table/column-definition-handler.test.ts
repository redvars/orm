import { assertEquals, assertThrows, describe, it } from "../../../test_deps.ts";
import ColumnDefinitionHandler from "../../../src/table/ColumnDefinitionHandler.ts";
import StringDataType from "../../../src/data-types/types/StringDataType.ts";

describe({
  name: "ColumnDefinitionHandler",
  fn: () => {
    it("#isUnique / #isIndexed / #isNotNull - default to false", () => {
      const handler = new ColumnDefinitionHandler(
        "widget",
        { name: "sku", type: "string" },
        new StringDataType(),
      );
      assertEquals(handler.isUnique(), false);
      assertEquals(handler.isIndexed(), false);
      assertEquals(handler.isNotNull(), false);
    });

    it("#isUnique / #isIndexed / #isNotNull - reflect explicit flags", () => {
      const handler = new ColumnDefinitionHandler(
        "widget",
        { name: "sku", type: "string", unique: true, index: true, not_null: true },
        new StringDataType(),
      );
      assertEquals(handler.isUnique(), true);
      assertEquals(handler.isIndexed(), true);
      assertEquals(handler.isNotNull(), true);
    });

    it("#getDefaultValue - null when unset, otherwise the declared default", () => {
      const withoutDefault = new ColumnDefinitionHandler(
        "widget",
        { name: "sku", type: "string" },
        new StringDataType(),
      );
      assertEquals(withoutDefault.getDefaultValue(), null);

      const withDefault = new ColumnDefinitionHandler(
        "widget",
        { name: "sku", type: "string", default: "N/A" },
        new StringDataType(),
      );
      assertEquals(withDefault.getDefaultValue(), "N/A");
    });

    it("#getNativeType - delegates to the resolved data type", () => {
      const handler = new ColumnDefinitionHandler(
        "widget",
        { name: "sku", type: "string" },
        new StringDataType(),
      );
      assertEquals(handler.getNativeType(), "VARCHAR");
    });

    it("#getNativeType / #getColumnType - throw when no data type was resolved", () => {
      const handler = new ColumnDefinitionHandler(
        "widget",
        { name: "field", type: "unknown-type" },
      );
      assertThrows(() => handler.getNativeType());
      assertThrows(() => handler.getColumnType());
    });

    it("#getDefinitionClone - returns an independent copy", () => {
      const handler = new ColumnDefinitionHandler(
        "widget",
        { name: "sku", type: "string" },
        new StringDataType(),
      );
      const clone = handler.getDefinitionClone();
      clone.name = "mutated";
      assertEquals(handler.getName(), "sku");
    });

    describe({
      name: "#validate",
      fn: () => {
        it("does not throw for a valid column", () => {
          const handler = new ColumnDefinitionHandler(
            "widget",
            { name: "sku", type: "string" },
            new StringDataType(),
          );
          handler.validate();
        });

        it("throws for a non-alphanumeric column name", () => {
          const handler = new ColumnDefinitionHandler(
            "widget",
            { name: "not valid", type: "string" },
            new StringDataType(),
          );
          assertThrows(() => handler.validate());
        });

        it("throws when the type isn't recognized", () => {
          const handler = new ColumnDefinitionHandler(
            "widget",
            { name: "field", type: "does-not-exist" },
          );
          assertThrows(() => handler.validate());
        });
      },
    });
  },
});
