import getORM from "./getORM.ts";

const odm = getORM();
const client = await odm.connect(true);

await client.defineTable({
  name: "department",
  columns: [
    {
      name: "name",
      type: "string",
      unique: true,
    },
  ],
});

await client.defineTable({
  name: "employee",
  columns: [
    {
      name: "name",
      type: "string",
    },
    {
      name: "department",
      type: "string",
      foreign_key: {
        table: "department",
        column: "name",
      },
    },
  ],
});

const department = client.table("department").createNewRecord();
department.set("name", "Engineering");
await department.insert();

const employee = client.table("employee").createNewRecord();
employee.set("name", "Ada Lovelace");
employee.set("department", "Engineering");
await employee.insert();

const employees = await client.table("employee").with("department").toArray();
for (const record of employees) {
  console.log(
    record.get("name") + " :: " +
      JSON.stringify(record.getRelated("department")?.toJSON()),
  );
}

client.closeConnection();
