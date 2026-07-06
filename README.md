# RESVARS ORM

![GitHub release (with filter)](https://img.shields.io/github/v/release/redvars/orm?label=Release)
[![Test](https://github.com/redvars/orm/workflows/Test/badge.svg)](https://github.com/redvars/orm/actions?workflow=Test)
[![Coverage](https://codecov.io/gh/redvars/orm/branch/main/graph/badge.svg)](https://codecov.io/gh/redvars/orm)
[![License](https://img.shields.io/github/license/redvars/orm.svg)](/LICENSE)
[![Contributors](https://img.shields.io/github/contributors/redvars/orm.svg)]()

RESVARS ORM (Object Relational Mapping) tool is built for Deno and provides
transparent persistence for JavaScript objects to Postgres database.

- Supports all primitive data types (string, integer, float, boolean, date,
  object, array, etc.).
- Supports custom data types.
- Supports table with multi-level inheritance.
- Supports transactions, indexes, and foreign-key eager-loading.
- Supports lightweight schema migrations (renames, drops, type changes) with
  an audit trail.
- Also supports interception on operations (create, read, update and delete).

```ts
import { ORM } from "jsr:@redvars/orm";
```

## Database connection

```ts
const odm = new ORM({
  database: "school-database",
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  port: 5432,
});

try {
  const client: ORMClient = await odm.connect(
    true, /* create database if not exists */
  );
  console.log("Client connected successfully");
  client.closeConnection();
} catch (error) {
  console.log("Error while establishing connection", error);
}
```

## Defining tables

Definition automatically includes `id` and `_table` fields on every table.

```ts
await client.defineTable({
  name: "department",
  columns: [
    {
      name: "name",
      type: "string",
    },
    {
      name: "code",
      type: "string",
    },
  ],
});

await client.defineTable({
  name: "teacher",
  columns: [
    {
      name: "name",
      type: "string",
    },
    {
      name: "badge_number",
      type: "integer",
    },
    {
      name: "age",
      type: "integer",
    },
    {
      name: "date_of_joining",
      type: "date",
    },
    {
      name: "department",
      type: "uuid",
      foreign_key: {
        table: "department",
        column: "id",
      },
    },
  ],
});
```

### Unique constraint

```ts
await client.defineTable({
  name: "student",
  columns: [
    {
      name: "name",
      type: "string",
    },
    {
      name: "roll_no",
      type: "integer",
      unique: true,
    },
    {
      name: "age",
      type: "integer",
    },
  ],
  unique: [["name", "age"]],
});
```

### Index

Per-column and table-level composite (non-unique) indexes:

```ts
await client.defineTable({
  name: "product",
  columns: [
    {
      name: "name",
      type: "string",
    },
    {
      name: "sku",
      type: "string",
      index: true,
    },
  ],
});

await client.defineTable({
  name: "order_item",
  columns: [
    {
      name: "order_id",
      type: "string",
    },
    {
      name: "product_id",
      type: "string",
    },
  ],
  index: [["order_id", "product_id"]],
});
```

## Querying

```ts
const teacherTable = client.table("teacher");
for (let i = 0; i < 10; i++) {
  const teacher = teacherTable.createNewRecord();
  teacher.set("name", randomNames());
  teacher.set("badge_number", i + 1);
  teacher.set("age", 10 * ((i + 1) % 2));
  await teacher.insert();
}

let records = await teacherTable.orderBy("badge_number", "DESC").toArray();

for (const record of records) {
  console.log(record.get("name") + " :: " + record.get("badge_number"));
}
console.log("Count :: " + (await teacherTable.count()));
```

## Querying with compound 'OR' and 'AND' conditions

```ts
// Where 'age' is 10  and (name is 'a1' or 'roll_no' is 5)
// SELECT * FROM public.teacher WHERE "age" = 10 AND ("name" = 'a1' OR "roll_no" = 5)

const selectQuery = teacherTable
  .where("age", 10)
  .andWhere((compoundQuery) => {
    compoundQuery
      .where("name", "a1")
      .orWhere("badge_number", "5");
  });

records = await selectQuery.toArray();
console.log(records.map((t) => t.toJSON()));
```

#### Using cursor

```ts
const recordCursor = await teacherTable
  .select()
  .orderBy("roll_no", "DESC")
  .execute();

for await (const record of recordCursor) {
  console.log(record.get("name") + " :: " + record.get("roll_no"));
}
```

## Transactions

Run multiple operations against a single connection, committing together or
rolling back together if anything throws.

```ts
await client.transaction(async (tx) => {
  const ledgerTable = tx.table("ledger_entry");

  const first = ledgerTable.createNewRecord();
  first.set("description", "Opening balance");
  await first.insert();

  const second = ledgerTable.createNewRecord();
  second.set("description", "First deposit");
  await second.insert();
});
```

If the callback throws, every operation performed through `tx` is rolled
back and the original error is re-thrown:

```ts
try {
  await client.transaction(async (tx) => {
    const ledgerTable = tx.table("ledger_entry");
    const entry = ledgerTable.createNewRecord();
    entry.set("description", "This should not be persisted");
    await entry.insert();

    throw new Error("Something went wrong after the insert");
  });
} catch (error) {
  // the insert above was rolled back
}
```

**Limitation:** the `tx` passed to the callback only exposes `table()` and
`query()` (DML). `defineTable()`/`dropTable()` (DDL) are not supported inside
a transaction in this release.

## Schema migrations

Calling `defineTable()` again for an existing table automatically adds any new
columns from the definition. Beyond that, `defineTable()` supports two opt-in
changes:

```ts
await client.defineTable({
  name: "note",
  columns: [
    {
      name: "heading",
      type: "string",
    },
  ],
  // Renames run before the add/drop diff, so a renamed column isn't
  // mistaken for a drop of the old name plus an add of the new one.
  renames: { title: "heading" },
  // Columns no longer present in the definition are left in place (and
  // logged) unless this is set - dropping a column is destructive, so it
  // requires explicit opt-in.
  allowDestructiveMigrations: true,
});
```

If a column's declared type changes, `defineTable()` also makes a best-effort
attempt to `ALTER COLUMN ... TYPE ... USING ...`, logging (rather than
aborting) if the cast fails. This only works for the built-in data types -
custom types registered via `ORM.addDataType()` are skipped.

Every change `defineTable()` actually applies (table creation, added columns,
renames, drops, type changes, added unique constraints and indexes) is
recorded to a `public._orm_migrations` table (`table_name`, `change_type`,
`detail`, `applied_at`) for after-the-fact auditability.

**Limitation:** this is not a full migration-file system - there are no
version numbers, no down-migrations, and no rename/type-change detection
beyond what's described above.

## Relations / eager loading

Eagerly load the related record for a foreign-key column with `.with()`,
then read it off each record via `getRelated()`:

```ts
const employees = await client.table("employee").with("department").toArray();
for (const record of employees) {
  console.log(
    record.get("name") + " :: " +
    JSON.stringify(record.getRelated("department")?.toJSON()),
  );
}
```

This runs as one extra batched query against the related table (not a SQL
join), so it doesn't do a query per row.

**Limitations:** many-to-one only (`getRelated()` returns a single record or
`undefined`, never an array); not supported together with `execute()`'s
streaming cursor - use `toArray()`/`getRecord()`.

## Intercepting database operations

Intercept and compute student full name before insert and print all records
after

```ts
const client = await odm.connect(true);

await client.defineTable({
  name: "student",
  columns: [
    {
      name: "first_name",
      type: "string",
    },
    {
      name: "last_name",
      type: "string",
    },
    {
      name: "full_name", /* Value computed in intercept */
      type: "string",
    },
  ],
});

class FullNameIntercept extends RecordInterceptor {
  getName() {
    return "full-name-intercept";
  }

  async intercept(
    table: Table,
    interceptType: TRecordInterceptorType,
    records: Record[],
    _context: TRecordInterceptorContext,
  ) {
    if (table.getName() === "student") {
      console.log(`[collectionName=${table.getName()}, when=${interceptType}]`);
      if (interceptType === "BEFORE_INSERT") {
        for (const record of records) {
          console.log(
            `Full name field updated for :: ${record.get("first_name")}`,
          );
          record.set(
            "full_name",
            `${record.get("first_name")} ${record.get("last_name")}`,
          );
        }
      }
      if (interceptType === "AFTER_SELECT") {
        for (const record of records) {
          console.log(JSON.stringify(record.toJSON(), null, 4));
        }
      }
    }
    return records;
  }
}

odm.addInterceptor(new FullNameIntercept());

const studentTable = client.table("student");
const studentRecord = studentTable.createNewRecord();
studentRecord.set("first_name", "John");
studentRecord.set("last_name", "Doe");
await studentRecord.insert();
await studentTable.toArray();
/* This will print the following:
[collectionName=student, operation=INSERT, when=BEFORE]
Full name field updated for :: John
[collectionName=student, operation=INSERT, when=AFTER]
[collectionName=student, operation=SELECT, when=BEFORE]
[collectionName=student, operation=SELECT, when=AFTER]
{
    "id": "653c21bb-7d92-435e-a742-1da749f914dd",
    "_table": "student",
    "first_name": "John",
    "last_name": "Doe",
    "full_name": "John Doe"
}
*/

client.closeConnection();
```

## Define custom field type

After connection established, you can define custom field type.

```ts
const client = await odm.connect(true);

class EmailType extends IDataType {
  constructor() {
    super("email");
  }

  getNativeType(_definition: TColumnDefinition): TColumnDataType {
    return "VARCHAR";
  }

  toJSONValue(value: string | null): string | null {
    return value;
  }

  validateDefinition(_columnDefinition: TColumnDefinition) {
    // Throw an error if something in definition is not meeting your expectation.
  }

  setValueIntercept(newValue: any): any {
    return newValue;
  }

  async validateValue(value: unknown): Promise<void> {
    const pattern = "(.+)@(.+){2,}\\.(.+){2,}";
    if (
      value &&
      typeof value === "string" &&
      !new RegExp(pattern).test(value)
    ) {
      throw new Error("Not a valid email");
    }
  }
}

odm.addDataType(new EmailType());

await client.defineTable({
  name: "employee",
  columns: [
    {
      name: "name",
      type: "string",
    },
    {
      name: "personal_contact",
      type: "email",
    },
    {
      name: "emp_no",
      type: "uuid",
    },
    {
      name: "salary",
      type: "integer",
    },
    {
      name: "birth_date",
      type: "date",
    },
    {
      name: "gender",
      type: "boolean",
    },
  ],
});

const studentTable = client.table("employee");
const student = studentTable.createNewRecord();
student.set("personal_contact", "NOT_EMAIL_VALUE");
student.set("birth_date", new Date());
try {
  await student.insert(); // this will throw an error, because email is not valid
  console.log("Student created");
} catch (error) {
  console.log(error);
}

client.closeConnection();
```

## Inheritance

```ts
const client = await odm.connect(true);

await client.defineTable({
  name: "animal",
  columns: [
    {
      name: "name",
      type: "string",
    },
  ],
});

const animalTable = client.table("animal");
const animal = animalTable.createNewRecord();
animal.set("name", "Puppy");
await animal.insert();

await client.defineTable({
  name: "dog",
  inherits: "animal",
  final: true,
  columns: [
    {
      name: "breed",
      type: "string",
    },
  ],
});

const dogTable = client.table("dog");
const husky = dogTable.createNewRecord();
husky.set("name", "Jimmy");
husky.set("breed", "Husky");
await husky.insert();

const animalCursor = await animalTable.execute();

for await (const animal of animalCursor()) {
  console.log(animal.toJSON());
}

client.closeConnection();
```

## Known limitations:

## Data types

| Data type    | Record.get             | Record.getJSONValue |
|--------------|------------------------|---------------------|
| **boolean**  | boolean                | boolean             |
| **date**     | Temporal.PlainDate     | string              |
| **datetime** | Temporal.PlainDateTime | string              |
| **integer**  | number                 | number              |
| **json**     | {}                     | {}                  |
| **number**   | number                 | number              |
| **string**   | string                 | string              |
| **uuid**     | string                 | string              |

Check the examples >> [here](./examples) <<

## Code of Conduct

[Contributor Covenant](/CODE_OF_CONDUCT.md)
