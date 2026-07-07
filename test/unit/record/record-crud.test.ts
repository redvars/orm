import {
  afterAll,
  assert,
  assertEquals,
  assertStrictEquals,
  beforeAll,
  describe,
  it,
} from "../../../test_deps.ts";

import { ORM, type ORMClient, type Record } from "../../../mod.ts";
import { Session } from "../../test.utils.ts";

describe({
  name: "Record CRUD",
  fn: () => {
    let client: ORMClient;
    const cleanTableList: string[] = [];
    let johnRecord: Record;

    let itDepartment: Record, hrDepartment: Record;

    beforeAll(async () => {
      client = await Session.getClient();
      await client.defineTable({
        name: "department",
        columns: [
          {
            name: "name",
            type: "string",
            unique: true,
          },
          {
            name: "description",
            type: "string",
          },
        ],
      });
      const departmentTable = client.table("department");
      itDepartment = departmentTable.createNewRecord();
      itDepartment.set("name", "IT");
      await itDepartment.insert();

      hrDepartment = departmentTable.createNewRecord();
      hrDepartment.set("name", "HR");
      await hrDepartment.insert();

      cleanTableList.push("department");
    });

    afterAll(async () => {
      const client = await Session.getClient();
      for (const table of cleanTableList) {
        await client.dropTable(table);
      }
      client.closeConnection();
    });

    it("#defineCollection with different field types", async () => {
      await client.defineTable({
        name: "employee",
        columns: [
          {
            name: "name",
            type: "string",
            unique: true,
          },
          {
            name: "department",
            type: "uuid",
            foreign_key: {
              table: "department",
              column: "id",
              on_delete: "CASCADE",
            },
          },
          {
            name: "salary",
            type: "integer",
            not_null: true,
          },
          {
            name: "birth_date",
            type: "date",
          },
          {
            name: "created_on",
            type: "datetime",
          },
          {
            name: "gender",
            type: "boolean",
          },
          {
            name: "address",
            type: "json",
          },
          {
            name: "rating",
            type: "number",
            default: 4.5,
          },
        ],
      });

      cleanTableList.push("employee");
    });

    /**
     * CREATE
     */
    it("#insert", async () => {
      const employeeTable = client.table("employee");
      const employee = employeeTable.createNewRecord();
      const empId = employee.getID();
      employee.set("name", "John");
      employee.set("emp_no", ORM.generateRecordId());
      employee.set("department", itDepartment.getID());
      employee.set("birth_date", Temporal.Now.plainDateISO());
      employee.set("created_on", Temporal.Now.plainDateTimeISO());
      employee.set("gender", true);
      employee.set("salary", 5000);
      employee.set("address", {
        street: "test",
        zipcode: 500000,
      });

      assertStrictEquals(employee.isNew(), true, "record is not new");
      assertStrictEquals(
        employee.getTable().getName(),
        "employee",
        "record is not new",
      );

      johnRecord = await employee.insert();

      const johnObject = johnRecord.toJSON();
      assertEquals(
        johnObject.id + "",
        empId,
        "id is expected to be same as initialized value",
      );
      assertEquals(johnObject.name, "John", "name is expected to be John");
      assertEquals(johnObject.rating, 4.5, "default is expected to be 4.5");
    });

    it("#::insert not null error", async () => {
      const employeeTable = client.table("employee");
      const employee = employeeTable.createNewRecord();
      employee.set("name", "Unique Name");
      try {
        await employee.insert();
      } catch (_error) {
        return;
      }
      assert(false, "not null error");
    });

    it("#insert unique error", async () => {
      const employeeTable = client.table("employee");
      const employee = employeeTable.createNewRecord();
      employee.set("name", "John");
      employee.set("salary", 500);
      try {
        await employee.insert();
      } catch (_error) {
        return;
      }
      assert(false, "duplicate key error");
    });

    /**
     * UPDATE
     */
    it("#update", async () => {
      johnRecord.set("salary", 200);
      try {
        const rec = await johnRecord.update();
        assert(rec.get("salary") === 200, "record not updated");
      } catch (_error) {
        assert(false, "duplicate key error");
      }
    });

    it("#getRecordById", async () => {
      const employeeTable = client.table("employee");
      const newEmp = employeeTable.createNewRecord();
      newEmp.set("name", "John 3");
      newEmp.set("salary", 500);
      await newEmp.insert();

      const employee: Record | undefined = await employeeTable.getRecord(
        newEmp.getID(),
      );
      assert(!!employee, "record not found");
      if (employee) {
        assertStrictEquals(
          employee.get("name"),
          "John 3",
          "name is expected to be John",
        );
      }
    });

    it("#Record::delete", async () => {
      const employeeTable = client.table("employee");
      const newEmp = employeeTable.createNewRecord();
      newEmp.set("name", "John 2");
      newEmp.set("salary", 500);
      await newEmp.insert();

      await newEmp.delete();
      const employee: Record | undefined = await employeeTable.getRecord(
        newEmp.getID(),
      );
      assert(!employee);
    });

    it("#insert - a plain root table record", async () => {
      await client.defineTable({
        name: "record_crud_widget",
        columns: [{ name: "name", type: "string" }],
      });
      cleanTableList.push("record_crud_widget");

      const record = client.table("record_crud_widget").createNewRecord();
      await record.insert();
      assert(!record.isNew());
    });

    it("#insert - a record on a table that inherits another", async () => {
      await client.defineTable({
        name: "record_crud_special_widget",
        inherits: "record_crud_widget",
        final: true,
        columns: [{ name: "extra", type: "string" }],
      });
      cleanTableList.push("record_crud_special_widget");

      const record = client.table("record_crud_special_widget")
        .createNewRecord();
      await record.insert();
      assert(!record.isNew());
    });
  },
});
