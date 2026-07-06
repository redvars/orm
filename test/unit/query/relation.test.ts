import {
  afterAll,
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
  beforeAll,
  describe,
  it,
} from "../../../test_deps.ts";

import { Session } from "../../test.utils.ts";
import type { ORMClient } from "../../../mod.ts";

describe({
  name: "Relation",
  fn: () => {
    let client: ORMClient;
    const cleanTableList: string[] = [];

    beforeAll(async () => {
      client = await Session.getClient();

      await client.defineTable({
        name: "dept",
        columns: [{ name: "name", type: "string", unique: true }],
      });
      cleanTableList.push("dept");

      await client.defineTable({
        name: "emp",
        columns: [
          { name: "name", type: "string" },
          {
            name: "dept_name",
            type: "string",
            foreign_key: { table: "dept", column: "name" },
          },
        ],
      });
      cleanTableList.push("emp");

      const dept = client.table("dept").createNewRecord();
      dept.set("name", "Engineering");
      await dept.insert();

      const emp = client.table("emp").createNewRecord();
      emp.set("name", "Ada");
      emp.set("dept_name", "Engineering");
      await emp.insert();

      const orphanEmp = client.table("emp").createNewRecord();
      orphanEmp.set("name", "NoDept");
      await orphanEmp.insert();
    });

    afterAll(async () => {
      const client = await Session.getClient();
      for (const table of cleanTableList) {
        await client.dropTable(table);
      }
      client.closeConnection();
    });

    it("#with - populates getRelated() via a foreign_key column", async () => {
      const records = await client.table("emp").with("dept_name").toArray();
      const found = records.find((r) => r.get("name") === "Ada");
      assert(found, "Expected to find Ada");
      assertEquals(found!.getRelated("dept_name")?.get("name"), "Engineering");
    });

    it("#with - throws for a column without a foreign_key", () => {
      assertThrows(() => client.table("emp").with("name"));
    });

    it("#with - throws when combined with execute()", async () => {
      await assertRejects(async () => {
        await client.table("emp").with("dept_name").execute();
      });
    });

    it("#with - missing/null FK value resolves to undefined", async () => {
      const records = await client.table("emp").with("dept_name").toArray();
      const found = records.find((r) => r.get("name") === "NoDept");
      assert(found, "Expected to find NoDept");
      assertEquals(found!.getRelated("dept_name"), undefined);
    });
  },
});
