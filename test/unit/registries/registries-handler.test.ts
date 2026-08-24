import { assert, assertEquals, describe, it } from "../../../test_deps.ts";
import RegistriesHandler from "../../../src/RegistriesHandler.ts";
import IDataType from "../../../src/data-types/IDataType.ts";
import RecordInterceptor from "../../../src/operation-interceptor/RecordInterceptor.ts";
import type { TTableDefinitionStrict } from "../../../src/types.ts";

class FakeDataType extends IDataType {
  constructor(name: string) {
    super(name);
  }
  getNativeType() {
    return "VARCHAR" as const;
  }
  validateDefinition() {}
  setValueIntercept(value: unknown): any {
    return value;
  }
  getObjectIntercept(value: unknown): any {
    return value;
  }
  async validateValue() {}
}

function makeTableDefinition(
  overrides: Partial<TTableDefinitionStrict> = {},
): TTableDefinitionStrict {
  return {
    schema: "public",
    name: "widget",
    final: false,
    columns: [],
    unique: [],
    index: [],
    renames: {},
    allowDestructiveMigrations: false,
    ...overrides,
  };
}

describe({
  name: "RegistriesHandler",
  fn: () => {
    it("#addDataType / #hasDataType / #getDataType", () => {
      const handler = new RegistriesHandler();
      assert(!handler.hasDataType("widget-type"));
      assertEquals(handler.getDataType("widget-type"), undefined);

      const dataType = new FakeDataType("widget-type");
      handler.addDataType(dataType);

      assert(handler.hasDataType("widget-type"));
      assertEquals(handler.getDataType("widget-type"), dataType);
    });

    it("#addTableDefinition / #getTableDefinition / #hasTableDefinition / #deleteTableDefinition", () => {
      const handler = new RegistriesHandler();
      const definition = makeTableDefinition();

      assert(!handler.hasTableDefinition("widget"));
      handler.addTableDefinition(definition);

      assert(handler.hasTableDefinition("widget"));
      assertEquals(handler.getTableDefinition("widget"), definition);

      handler.deleteTableDefinition("widget");
      assert(!handler.hasTableDefinition("widget"));
    });

    it("#getAllTableDefinitions - returns every registered definition", () => {
      const handler = new RegistriesHandler();
      handler.addTableDefinition(makeTableDefinition({ name: "widget" }));
      handler.addTableDefinition(makeTableDefinition({ name: "gadget" }));

      const all = handler.getAllTableDefinitions();
      assertEquals(all.length, 2);
      assertEquals(all.map((d) => d.name).sort(), ["gadget", "widget"]);
    });

    it("#addInterceptor / #deleteInterceptor / #intercept", async () => {
      const handler = new RegistriesHandler();
      let calls = 0;

      class CountingInterceptor extends RecordInterceptor {
        getName() {
          return "registries-handler-test-interceptor";
        }
        async intercept(_table: any, _operation: any, records: any[]) {
          calls++;
          return records;
        }
      }
      handler.addInterceptor(new CountingInterceptor());

      const records = [{ id: "1" } as any];
      const result = await handler.intercept(
        undefined as any,
        "BEFORE_INSERT",
        records,
      );
      assertEquals(calls, 1);
      assertEquals(result, records);

      handler.deleteInterceptor("registries-handler-test-interceptor");
      await handler.intercept(undefined as any, "BEFORE_INSERT", records);
      assertEquals(calls, 1, "interceptor should not run after being deleted");
    });
  },
});
