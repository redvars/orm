import {
  assert,
  assertEquals,
  assertThrows,
  describe,
  it,
} from "../../../test_deps.ts";
import Registry from "../../../src/Registry.ts";

type Widget = { name: string };

function newRegistry(): Registry<Widget> {
  return new Registry<Widget>((widget) => widget.name);
}

describe({
  name: "Registry",
  fn: () => {
    it("#has / #get - reflect registered/unregistered items", () => {
      const registry = newRegistry();
      assert(!registry.has("gizmo"));
      assertEquals(registry.get("gizmo"), undefined);

      const gizmo = { name: "gizmo" };
      registry.add(gizmo);

      assert(registry.has("gizmo"));
      assertEquals(registry.get("gizmo"), gizmo);
    });

    it("#hasEntries - false when empty, true after add", () => {
      const registry = newRegistry();
      assert(!registry.hasEntries());
      registry.add({ name: "gizmo" });
      assert(registry.hasEntries());
    });

    it("#values - returns every registered item", () => {
      const registry = newRegistry();
      assertEquals(registry.values(), []);

      registry.add({ name: "gizmo" });
      registry.add({ name: "widget" });

      const values = registry.values();
      assertEquals(values.length, 2);
      assertEquals(values.map((v) => v.name).sort(), ["gizmo", "widget"]);
    });

    it("#add - keys items by the constructor's getKey function", () => {
      const registry = newRegistry();
      registry.add({ name: "gizmo" });
      registry.add({ name: "gizmo" }); // same key - overwrites, doesn't duplicate
      assertEquals(registry.values().length, 1);
    });

    it("#add - throws when the item is not an object", () => {
      const registry = newRegistry();
      assertThrows(
        () => registry.add("not-an-object" as unknown as Widget),
        Error,
        "Registry item must be an object",
      );
    });

    it("#add - throws when the item is null", () => {
      const registry = newRegistry();
      assertThrows(
        () => registry.add(null as unknown as Widget),
        Error,
        "Registry item must not be null",
      );
    });

    it("#delete - returns true when an item existed, false otherwise", () => {
      const registry = newRegistry();
      registry.add({ name: "gizmo" });

      assertEquals(registry.delete("gizmo"), true);
      assertEquals(registry.delete("gizmo"), false);
      assert(!registry.has("gizmo"));
    });
  },
});
