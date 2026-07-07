import {
  assert,
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../test_deps.ts";
import RegistriesHandler from "../../../src/RegistriesHandler.ts";
import TableDefinitionHandler from "../../../src/table/TableDefinitionHandler.ts";
import StringDataType from "../../../src/data-types/types/StringDataType.ts";
import UUIDDataType from "../../../src/data-types/types/UUIDDataType.ts";
import IntegerDataType from "../../../src/data-types/types/IntegerDataType.ts";

function makeRegistriesHandler(): RegistriesHandler {
  const handler = new RegistriesHandler();
  handler.addDataType(new StringDataType());
  handler.addDataType(new UUIDDataType());
  handler.addDataType(new IntegerDataType());
  return handler;
}

describe({
  name: "TableDefinitionHandler",
  fn: () => {
    it("#getName / #getTableName / #getSchemaName - defaults schema to public", () => {
      const registries = makeRegistriesHandler();
      const handler = new TableDefinitionHandler(
        { name: "widget", columns: [] },
        registries,
      );
      assertEquals(handler.getName(), "widget");
      assertEquals(handler.getTableName(), "widget");
      assertEquals(handler.getSchemaName(), "public");
    });

    it("#getName - keeps a non-public schema prefix", () => {
      const registries = makeRegistriesHandler();
      const handler = new TableDefinitionHandler(
        { name: "employee", schema: "company", columns: [] },
        registries,
      );
      assertEquals(handler.getName(), "company.employee");
      assertEquals(handler.getSchemaName(), "company");
    });

    it("#isFinal - defaults to false", () => {
      const registries = makeRegistriesHandler();
      const handler = new TableDefinitionHandler(
        { name: "widget", columns: [] },
        registries,
      );
      assertEquals(handler.isFinal(), false);

      const finalHandler = new TableDefinitionHandler(
        { name: "widget2", columns: [], final: true },
        registries,
      );
      assertEquals(finalHandler.isFinal(), true);
    });

    it("#getOwnColumns - injects id/_table only on a root (non-inheriting) table", () => {
      const registries = makeRegistriesHandler();
      const root = new TableDefinitionHandler(
        { name: "animal", columns: [{ name: "name", type: "string" }] },
        registries,
      );
      const rootNames = root.getOwnColumns().map((c) => c.getName());
      assertEquals(rootNames, ["id", "_table", "name"]);

      registries.addTableDefinition(root.getDefinitionClone());
      const child = new TableDefinitionHandler(
        {
          name: "dog",
          inherits: "animal",
          columns: [{ name: "breed", type: "string" }],
        },
        registries,
      );
      const childOwnNames = child.getOwnColumns().map((c) => c.getName());
      assertEquals(childOwnNames, ["breed"]);
    });

    it("#getColumns - merges own columns with the registered parent's columns", () => {
      const registries = makeRegistriesHandler();
      const root = new TableDefinitionHandler(
        { name: "animal", columns: [{ name: "name", type: "string" }] },
        registries,
      );
      registries.addTableDefinition(root.getDefinitionClone());

      const child = new TableDefinitionHandler(
        {
          name: "dog",
          inherits: "animal",
          columns: [{ name: "breed", type: "string" }],
        },
        registries,
      );
      assertEquals(
        child.getColumns().map((c) => c.getName()),
        ["breed", "id", "_table", "name"],
      );
    });

    it("#getExtendedTables - walks up a multi-level inheritance chain", () => {
      const registries = makeRegistriesHandler();
      const animal = new TableDefinitionHandler(
        { name: "animal", columns: [] },
        registries,
      );
      registries.addTableDefinition(animal.getDefinitionClone());

      const dog = new TableDefinitionHandler(
        { name: "dog", inherits: "animal", columns: [] },
        registries,
      );
      registries.addTableDefinition(dog.getDefinitionClone());

      const husky = new TableDefinitionHandler(
        { name: "husky", inherits: "dog", columns: [] },
        registries,
      );
      assertEquals(husky.getExtendedTables(), ["husky", "dog", "animal"]);
    });

    it("#getBaseName - resolves to the root ancestor", () => {
      const registries = makeRegistriesHandler();
      const animal = new TableDefinitionHandler(
        { name: "animal", columns: [] },
        registries,
      );
      registries.addTableDefinition(animal.getDefinitionClone());

      const dog = new TableDefinitionHandler(
        { name: "dog", inherits: "animal", columns: [] },
        registries,
      );
      assertEquals(dog.getBaseName(), "animal");
    });

    it("#getDescendantTables - scans all registered definitions for descendants", () => {
      const registries = makeRegistriesHandler();
      const animal = new TableDefinitionHandler(
        { name: "animal", columns: [] },
        registries,
      );
      registries.addTableDefinition(animal.getDefinitionClone());

      const dog = new TableDefinitionHandler(
        { name: "dog", inherits: "animal", columns: [] },
        registries,
      );
      registries.addTableDefinition(dog.getDefinitionClone());

      const cat = new TableDefinitionHandler(
        { name: "cat", inherits: "animal", columns: [] },
        registries,
      );
      registries.addTableDefinition(cat.getDefinitionClone());

      assertEquals(animal.getDescendantTables().sort(), ["cat", "dog"]);
      assertEquals(dog.getDescendantTables(), []);
    });

    it("#getUniqueConstraints / #getIndexes - table-level groups plus per-column flags (excluding id)", () => {
      const registries = makeRegistriesHandler();
      const handler = new TableDefinitionHandler(
        {
          name: "student",
          columns: [
            { name: "roll_no", type: "integer", unique: true, index: true },
          ],
          unique: [["name", "age"]],
          index: [["age"]],
        },
        registries,
      );
      assertEquals(handler.getUniqueConstraints(), [["name", "age"]]);
      assertEquals(handler.getIndexes(), [["age"], ["roll_no"]]);
    });

    it("#getRenames / #allowsDestructiveMigrations - default to empty/false", () => {
      const registries = makeRegistriesHandler();
      const handler = new TableDefinitionHandler(
        { name: "widget", columns: [] },
        registries,
      );
      assertEquals(handler.getRenames(), {});
      assertEquals(handler.allowsDestructiveMigrations(), false);

      const withOverrides = new TableDefinitionHandler(
        {
          name: "widget2",
          columns: [],
          renames: { old_name: "new_name" },
          allowDestructiveMigrations: true,
        },
        registries,
      );
      assertEquals(withOverrides.getRenames(), { old_name: "new_name" });
      assertEquals(withOverrides.allowsDestructiveMigrations(), true);
    });

    it("#getDefinitionClone - returns an independent copy", () => {
      const registries = makeRegistriesHandler();
      const handler = new TableDefinitionHandler(
        { name: "widget", columns: [{ name: "sku", type: "string" }] },
        registries,
      );
      const clone = handler.getDefinitionClone();
      clone.columns[0].name = "mutated";
      assertEquals(handler.getDefinitionClone().columns[0].name, "sku");
    });

    describe({
      name: "#validate",
      fn: () => {
        it("throws for a non-alphanumeric table name", () => {
          const registries = makeRegistriesHandler();
          const handler = new TableDefinitionHandler(
            { name: "invalid name", columns: [] },
            registries,
          );
          assertThrows(() => handler.validate());
        });

        it("throws when the table name is already registered", () => {
          const registries = makeRegistriesHandler();
          const existing = new TableDefinitionHandler(
            { name: "widget", columns: [] },
            registries,
          );
          registries.addTableDefinition(existing.getDefinitionClone());

          const duplicate = new TableDefinitionHandler(
            { name: "widget", columns: [] },
            registries,
          );
          assertThrows(() => duplicate.validate());
        });

        it("throws when inheriting a table that isn't registered", () => {
          const registries = makeRegistriesHandler();
          const handler = new TableDefinitionHandler(
            { name: "dog", inherits: "animal", columns: [] },
            registries,
          );
          assertThrows(() => handler.validate());
        });

        it("throws when inheriting a final table", () => {
          const registries = makeRegistriesHandler();
          const parent = new TableDefinitionHandler(
            { name: "employee", columns: [], final: true },
            registries,
          );
          registries.addTableDefinition(parent.getDefinitionClone());

          const child = new TableDefinitionHandler(
            { name: "manager", inherits: "employee", columns: [] },
            registries,
          );
          assertThrows(() => child.validate());
        });

        it("throws for a duplicate column name across the inheritance chain", () => {
          const registries = makeRegistriesHandler();
          const parent = new TableDefinitionHandler(
            {
              name: "person",
              columns: [{ name: "name", type: "string" }],
            },
            registries,
          );
          registries.addTableDefinition(parent.getDefinitionClone());

          const child = new TableDefinitionHandler(
            {
              name: "employee",
              inherits: "person",
              columns: [{ name: "name", type: "integer" }],
            },
            registries,
          );
          assertThrows(() => child.validate());
        });

        it("throws for an unknown column type", () => {
          const registries = makeRegistriesHandler();
          const handler = new TableDefinitionHandler(
            {
              name: "widget",
              columns: [{ name: "field", type: "does-not-exist" }],
            },
            registries,
          );
          assertThrows(() => handler.validate());
        });

        it("does not throw for a valid, non-conflicting definition", () => {
          const registries = makeRegistriesHandler();
          const handler = new TableDefinitionHandler(
            { name: "widget", columns: [{ name: "name", type: "string" }] },
            registries,
          );
          handler.validate();
          assert(true);
        });
      },
    });
  },
});
