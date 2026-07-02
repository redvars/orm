# RESVARS ORM — Architecture

RESVARS ORM (`@redvars/orm`) is an Object Relational Mapping library built for
**Deno** that provides transparent persistence of JavaScript objects to a
**PostgreSQL** database. It supports primitive and custom data types, multi-level
table inheritance, and interception of CRUD operations.

- **Runtime:** Deno (uses `Temporal`, private class fields `#`, `jsr:`/`npm:` imports)
- **Database:** PostgreSQL, accessed through the `pg` npm driver
- **Entry point:** `mod.ts` (mapped to `./mod.ts` via the `exports` field in `deno.json`)
- **Package:** `@redvars/orm`

---

## 1. High-level layering

The codebase is organized into cooperating layers. Requests flow downward from
the public API to the raw SQL driver, while data (records) flows back up.

```
┌─────────────────────────────────────────────────────────────┐
│  Public API (mod.ts)                                         │
│  ORM · ORMClient · Table · Record · Query · IDataType ·      │
│  RecordInterceptor · Column · WhereClause · ORMError         │
└─────────────────────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│  Domain / Object-mapping layer                               │
│  ORM  →  ORMClient  →  Table  →  Record                      │
│  (schema definition, records, CRUD, inheritance)             │
└─────────────────────────────────────────────────────────────┘
              │                         │
┌─────────────▼──────────┐   ┌──────────▼─────────────────────┐
│  Registries            │   │  Interception                  │
│  RegistriesHandler     │   │  DatabaseOperationInterceptor  │
│   ├─ table definitions │   │  Service                       │
│   ├─ data types        │   │   └─ RecordInterceptor(s)      │
│   └─ interceptors      │   │                                │
└────────────────────────┘   └────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│  Query-building layer                                        │
│  query/Query (facade)                                        │
│  core/query-builder → DQL(Select) · DML(Insert/Update/       │
│  Delete) · DDL(Create/Alter) · CLAUSES · EXPRESSIONS         │
└─────────────────────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│  Connection layer                                            │
│  DatabaseConnectionPool (pg.Pool) → DatabaseClient           │
└─────────────────────────────────────────────────────────────┘
              │
        ┌─────▼─────┐
        │ PostgreSQL │
        └───────────┘
```

---

## 2. Core components

### `ORM` (`src/ORM.ts`)
The top-level factory and configuration holder. Responsibilities:

- Holds the `TDatabaseConfiguration` and a single `RegistriesHandler` instance.
- On construction, registers all **built-in data types** (`string`, `char`,
  `integer`, `number`, `boolean`, `date`, `datetime`, `time`, `json`, `uuid`).
- `connect(createDatabaseIfNotExists?)` builds an `ORMClient`, tests the
  connection, and — if the database does not exist and the flag is set —
  connects to the default `postgres` database, creates the target database, and
  reconnects.
- Public registration hooks: `addDataType()`, `addInterceptor()`,
  `deleteInterceptor()`, `isTableDefined()`.
- Static helpers: `generateRecordId()`, `isValidRecordId()`.

The `RegistriesHandler` is created **once** in the `ORM` and shared with every
`ORMClient` and `Table`, so schema/type/interceptor registrations made on the
`ORM` are visible everywhere.

### `ORMClient` (`src/ORMClient.ts`)
Represents a live, connected session. Owns a `DatabaseConnectionPool`.
Responsibilities:

- **Connection lifecycle:** `testConnection()`, `closeConnection()`,
  `dropDatabase()`.
- **Schema management — `defineTable()`:** the central DDL routine. It:
  1. Wraps the raw definition in a `TableDefinitionHandler` and validates it.
  2. Registers the (defaulted, cloned) definition in the registry.
  3. Ensures the target schema exists (`CREATE SCHEMA IF NOT EXISTS`).
  4. If the table does not exist → builds a `CREATE TABLE` via `Query`
     (columns, unique constraints, `INHERITS`).
  5. If the table exists → diffs existing columns / unique constraints against
     the definition and issues `ALTER TABLE` for additions (a lightweight
     migration step).
- `defineTable()` also accepts a **decorated class** (see
  `TableSchemaDecorators`), reading its `__tableDefinition`.
- `dropTable()`, `deregisterTable()`.
- **Factories:** `table(name, context?)` returns a `Table`; `query()` returns a
  bare `Query`.

### `Table` (`src/table/Table.ts`)
The primary object-mapping API for a single table. **Extends
`TableDefinitionHandler`**, so it is both a schema descriptor and a query/record
gateway. Responsibilities:

- **Record factories:** `createNewRecord()` (new, unsaved) and
  `convertRawRecordToRecord(raw)` (hydrate a DB row).
- **Fluent query surface:** `where` / `andWhere` / `orWhere`, `limit`, `offset`,
  `orderBy` — each delegates to an internal `Query` and returns `this` for
  chaining.
- **Terminal operations:** `toArray()` (materialize to `Record[]`), `execute()`
  (returns an async-generator **cursor** factory for streaming), `count()`,
  `getRecord(idOrColumnOrFilter, value?)`.
- **Interception bridge:** `intercept(operation, records)` forwards to the
  `RegistriesHandler`, threading the table's `context` and the current
  intercept-disable state.
- **Intercept toggles:** `disableIntercepts()`, `enableIntercepts()`,
  `disableIntercept(name)`.
- **Trigger toggles:** `disableAllTriggers()` / `enableAllTriggers()` issue
  `ALTER TABLE ... DISABLE/ENABLE TRIGGER ALL`.
- Holds an optional per-call **`context`** (`TRecordInterceptorContext`) that is
  passed to every interceptor.

`SELECT` reads run interception at `BEFORE_SELECT` (once) and `AFTER_SELECT`
(per row, including inside the streaming cursor generator).

### `Record` (`src/record/Record.ts`)
A single row instance ("active record" style). Responsibilities:

- Holds the raw record map (`#record`), a modified-columns set
  (`#columnsModified`), and an `#isNew` flag.
- **Value access:** `set(key, value)` (runs the data type's
  `setValueIntercept`), `get(key)`, `getJSONValue(key)`, `toJSON(columns?)`.
- **Persistence:** `insert()`, `update()`, `delete()` — each wraps the operation
  in `BEFORE_*` / `AFTER_*` interception, validates fields, builds the SQL via
  its own `Query`, executes it, and rehydrates from the `RETURNING *` row.
- **Validation (`#validateRecord`):** iterates columns and calls each data type's
  `validateValue`, collecting `FieldValidationError`s into a `RecordSaveError`.
- On `createNewRecord()`, `#initialize()` seeds defaults and auto-assigns `id`
  (UUID) and `_table`.

---

## 3. Registries (`src/RegistriesHandler.ts`, `src/Registry.ts`)

`Registry<T>` is a generic `Map`-backed store keyed by a `getKey(item)`
function. `RegistriesHandler` composes three registries and is the single source
of truth shared across the ORM:

| Registry                        | Key                      | Holds                        |
|---------------------------------|--------------------------|------------------------------|
| table definition registry       | short-form table name    | `TTableDefinitionStrict`     |
| data type registry              | data type name           | `IDataType`                  |
| operation interceptor *service* | interceptor name         | `RecordInterceptor` (via `DatabaseOperationInterceptorService`) |

`RegistriesHandler.intercept(...)` is a thin delegate to the interceptor
service. Because the same handler instance is injected from `ORM` → `ORMClient`
→ `Table`, registering a type/interceptor/table anywhere makes it available
everywhere.

---

## 4. Schema & data-type subsystem

### Table definition (`src/table/TableDefinitionHandler.ts`)
- Normalizes a `TTableDefinition` → `TTableDefinitionStrict` via `setDefaults`
  (defaults `schema="public"`, `final=false`, empty `columns`/`unique`).
- Wraps each column in a `Column`.
- **Inheritance resolution:** `getColumns()` merges own columns with the parent
  table's columns (looked up recursively from the registry); `getExtendedTables()`
  and `getBaseName()` walk the inheritance chain.
- Auto-injects `id` (uuid, unique, not-null) and `_table` (string) columns on
  **root** tables only (children inherit them).
- `validate()` checks table-name format, inheritance validity (parent exists,
  parent not `final`), per-column validity, and duplicate columns; throws
  `TableDefinitionError`.

### Columns (`src/table/Column.ts`, `src/table/ColumnDefinitionHandler.ts`)
- `ColumnDefinitionHandler` normalizes column defaults and exposes accessors
  (`isUnique`, `isNotNull`, `getNativeType`, `getDefaultValue`, `getColumnType`)
  and `validate()`.
- `Column` extends it, resolving the `IDataType` instance from the registry by
  the column's declared `type`.

### Data types (`src/data-types/`)
`IDataType` is the abstract contract every type implements:

| Method                | Purpose                                             |
|-----------------------|-----------------------------------------------------|
| `getNativeType()`     | maps to a Postgres `TColumnDataType` (e.g. `VARCHAR`)|
| `validateDefinition()`| validates the column definition at define-time      |
| `setValueIntercept()` | coerces a value on `Record.set` (e.g. `Date` → `Temporal.PlainDate`) |
| `toJSONValue()`       | serializes for `toJSON` / JSON output               |
| `validateValue()`     | async value validation before persistence           |

Built-in implementations live in `src/data-types/types/` (Boolean, Char, Date,
DateTime, Integer, JSON, Number, String, Time, UUID). Custom types are added at
runtime via `ORM.addDataType()` (see README's `EmailType` example).

### Declarative decorators (`src/TableSchemaDecorators.ts`)
An alternative, class-based way to declare tables: `@Table()`,
`@DataTypeString()`, `@DataTypeInteger()` build a `__tableDefinition` on the
class that `ORMClient.defineTable()` can consume.

---

## 5. Interception subsystem (`src/operation-interceptor/`)

- `RecordInterceptor` — abstract base; subclasses implement `getName()` and
  `intercept(table, operation, records, context)`, and may set an `order`
  (default 100).
- `DatabaseOperationInterceptorService` — stores interceptors in a `Map`, runs
  them **sorted by order**, and lets a `Table` disable all or specific
  interceptors per call.
- **Operation hooks (`TRecordInterceptorType`):** `BEFORE_INSERT`,
  `AFTER_INSERT`, `BEFORE_UPDATE`, `AFTER_UPDATE`, `BEFORE_DELETE`,
  `AFTER_DELETE`, `BEFORE_SELECT`, `AFTER_SELECT`.

Interceptors receive and return the `Record[]`, so they can mutate, augment, or
filter records in-flight (e.g. compute a derived field before insert).

---

## 6. Query-building subsystem

There are **two** query layers:

### `src/query/` — high-level facade
`Query` (`src/query/Query.ts`) is a stateful facade owning a
`DatabaseConnectionPool`. It exposes a unified fluent API
(`select/insert/update/delete/create/alter` + clause methods) that internally
instantiates and delegates to the appropriate builder object, then:

- `getSQLQuery()` — builds the final SQL string.
- `execute(sql?)` — reserves a pooled client, runs the SQL, releases the client.
- `cursor()` — for `SELECT`, opens a `pg-cursor` for streaming reads.

`CreateQuery` and `AlterQuery` (DDL) live in `src/query/`; the DML/DQL builders
are re-used from the lower layer.

### `src/core/query-builder/` — SQL builders
Pure, connection-agnostic SQL string builders:

- **DQL:** `DQL/SelectQuery.ts`
- **DML:** `DML/InsertQuery.ts`, `UpdateQuery.ts`, `DeleteQuery.ts`
- **CLAUSES:** `WhereClause`, `OrderByClause`, `GroupByClause`, `LimitClause`,
  `OffsetClause`, `ColumnsListClause` (all implement `IClause`, exposing
  `prepareStatement()`).
- **EXPRESSIONS:** `SimpleExpression` (a single `column operator value`) and
  `CompoundExpression` (AND/OR trees). `WhereClause.where(fn)` accepts a
  callback to build nested compound expressions.
- `PostgresQueryBuilder` — static factory helpers for the builders.
- `PreparedStatement` / `TPreparedStatement` — an intermediate
  `{ sql, values }` shape. Builders assemble parameterized fragments (`%I`, `%L`,
  `%s`) that are finally rendered by **`pg-format`**, which handles SQL
  identifier/literal escaping.

**Operator model:** `src/core/types.ts` defines
`WHERE_CLAUSE_OPERATORS_CONFIG` — the full operator set (`=`, `!=`, `LIKE`,
`IN`, `BETWEEN`, `IS NULL`, etc.) plus metadata flags (`arrayValues`,
`noValue`). `SimpleExpression` uses these to normalize shorthand calls
(`where("age", 10)` → `=`), route array operators (`IN`), value-less operators
(`IS NULL`), and translate `= null` → `IS NULL`.

---

## 7. Connection layer (`src/core/connection/`)

- **`DatabaseConnectionPool`** wraps a `pg.Pool`. Provides `testConnection()`,
  `connect()` (checks out a client as a `DatabaseClient`), `createDatabase()`,
  `dropDatabase()`, `executeQuery()`, and `end()`. Maps Postgres error code
  `3D000` to `ORMError.databaseDoesNotExistsError`.
- **`DatabaseClient`** wraps a single checked-out `pg.Client`: `executeQuery()`,
  `createCursor()` (via `pg-cursor`), schema helpers, and `release()`.

The pool is created per `ORMClient`; individual queries reserve a client, run,
and release it in `finally`/after execution.

---

## 8. Errors (`src/errors/`)

- `ORMError` — base error with a typed `code`
  (`GENERAL`, `DATABASE_DOES_NOT_EXISTS`, `QUERY`,
  `TABLE_DEFINITION_VALIDATION`, `RECORD_VALIDATION`) and static throwers.
- `TableDefinitionError` — aggregates schema validation failures.
- `FieldValidationError` — a single field's validation failure.
- `RecordSaveError` — wraps insert/update/delete failures and collects
  `FieldValidationError`s.

---

## 9. Cross-cutting utilities

- **`src/utils.ts`** — `runSQLQuery`, `logSQLQuery` (debug logging via
  `pg-minify`), table-name helpers (`getFullFormTableName`,
  `getShortFormTableName`), `generateUUID` / `validateUUID`, `findDuplicates`,
  `isEqualArray`.
- **`deps.ts`** — the single dependency barrel: `pg`, `pg-cursor`, `pg-format`,
  `pg-minify`, `@std/uuid`, `@std/crypto`, and `@redvars/utils`
  (`CommonUtils`, `Logger`, `LoggerUtils`) plus JSON/`UUID4` types from
  `@utility/types`.
- **Logging** — a `Logger` is threaded from `ORM` down through `ORMClient`,
  `Table`, and `Record`; SQL is logged at `DEBUG` level.

---

## 10. Typical request flows

### Define a table
```
ORMClient.defineTable(def)
  → TableDefinitionHandler.validate()
  → RegistriesHandler.addTableDefinition()
  → ensure schema exists
  → Query.create()/alter()  (CreateQuery / AlterQuery → SQL)
  → DatabaseConnectionPool.connect() → DatabaseClient.executeQuery()
```

### Insert a record
```
table.createNewRecord()  →  record.set(...)  →  record.insert()
  → intercept BEFORE_INSERT
  → #validateRecord() (per-column IDataType.validateValue)
  → Query.insert().into().columns().values().returning('*')
  → execute (pooled client)
  → rehydrate from RETURNING row
  → intercept AFTER_INSERT
```

### Query records
```
table.where(...).orderBy(...).toArray()
  → intercept BEFORE_SELECT
  → SelectQuery.buildQuery() → pg-format → SQL
  → execute (or execute() → pg-cursor stream)
  → each row → convertRawRecordToRecord() → intercept AFTER_SELECT
```

---

## 11. Testing & tooling

- **Tests** (`test/`): unit tests (connection, schema, insert, select, intercept,
  custom-field-type), a shared `test-suite.ts`, and DB `setUp`/`tearDown`
  scripts. Run via `deno task test` (which does setUp → `test:unit` → tearDown).
- **Coverage:** `deno task coverage` produces LCOV under `dist/coverage`.
- **Performance/benchmarks:** `test/performance/` (plain + worker-based) and
  `deno task bench`.
- **Examples** (`examples/`): runnable end-to-end scripts mirroring the README
  (connection, define+query, interception, custom types, inheritance,
  references).
- **CI:** `.github/workflows/` (`test.yml`, `publish.yml`); published to JSR as
  `@redvars/orm`.

---

## 12. Key design characteristics

- **Single shared registry** wires schema, data types, and interceptors across
  every layer without a global singleton.
- **Active-record** style: `Record` instances know how to persist themselves.
- **Layered query building:** a stateful `Query` facade over pure, testable SQL
  builders that emit parameterized fragments escaped by `pg-format`.
- **Extensibility seams:** custom `IDataType`s and `RecordInterceptor`s are
  first-class runtime registrations.
- **Postgres-native features** are leveraged directly: table `INHERITS`, schemas,
  triggers, and cursors.
- **Deno-first:** private fields, `Temporal` for date/time types, and
  `jsr:`/`npm:` imports centralized in `deps.ts`.
