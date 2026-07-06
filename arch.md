# RESVARS ORM — Architecture

RESVARS ORM (`@redvars/orm`) is an Object Relational Mapping library built for
**Deno** that provides transparent persistence of JavaScript objects to a
**PostgreSQL** database. It supports primitive and custom data types,
multi-level table inheritance (via an application-level `UNION ALL`, not
native Postgres `INHERITS`), transactions, indexes, a lightweight schema
migration/audit story, foreign-key eager-loading, and interception of CRUD
operations.

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
│  ORM · ORMClient · TransactionClient · Table · Record ·      │
│  Query · IDataType · RecordInterceptor · Column ·             │
│  WhereClause · ORMError                                       │
└─────────────────────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│  Domain / Object-mapping layer                               │
│  ORM → ORMClient ⇄ TransactionClient → Table → Record         │
│  (schema definition, records, CRUD, inheritance, relations)   │
└─────────────────────────────────────────────────────────────┘
              │              │                  │
┌─────────────▼──────┐ ┌─────▼───────────┐ ┌────▼───────────┐
│  Registries        │ │  Interception   │ │  Migration      │
│  RegistriesHandler  │ │  DatabaseOper-  │ │  MigrationLedger│
│   ├─ table defs     │ │  ationIntercep- │ │  (audit trail,  │
│   ├─ data types     │ │  torService     │ │   type mapping) │
│   └─ interceptors   │ │  └─ Record-     │ │                 │
│                     │ │     Interceptor │ │                 │
└─────────────────────┘ └─────────────────┘ └─────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│  Query-building layer                                        │
│  query/Query (facade)                                        │
│  core/query-builder → DQL(Select) · DML(Insert/Update/       │
│  Delete) · DDL(Create/Alter) · CLAUSES · EXPRESSIONS          │
└─────────────────────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│  Connection layer                                             │
│  IConnectable ← DatabaseConnectionPool (pg.Pool)              │
│              ← TransactionConnection (one reused client)      │
│  → DatabaseClient                                             │
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
Represents a live, connected session. Owns a `DatabaseConnectionPool` and a
`MigrationLedger`. Responsibilities:

- **Connection lifecycle:** `testConnection()`, `closeConnection()`,
  `dropDatabase()`.
- **Transactions — `transaction(callback)`:** reserves one `DatabaseClient`,
  runs `BEGIN`, constructs a `TransactionClient` wrapping that single
  connection (via `TransactionConnection`/`DatabaseClient.withNonReleasingHandle()`),
  invokes `callback`, then `COMMIT`s on success or `ROLLBACK`s and rethrows on
  error, always releasing the real connection exactly once. DDL
  (`defineTable()`/`dropTable()`) is intentionally not exposed on
  `TransactionClient` — it manages its own connection reservation and isn't
  supported inside a transaction.
- **Schema management — `defineTable()`:** the central DDL routine. It:
  1. Wraps the raw definition in a `TableDefinitionHandler` and validates it.
  2. Registers the (defaulted, cloned) definition in the registry.
  3. Ensures the migration ledger table and the target schema exist.
  4. If the table does not exist → builds a `CREATE TABLE` via `Query`
     (every column the table's hierarchy declares — own + inherited — plus
     unique constraints and a `PRIMARY KEY`; no `INHERITS`), then creates any
     declared indexes.
  5. If the table exists → `#alterTableIfNeeded()` runs, in order: column
     renames, `ADD COLUMN` for new columns, best-effort `ALTER COLUMN TYPE`
     for changed built-in types, opt-in `DROP COLUMN` for removed columns,
     `ADD UNIQUE` for new unique groups, then index creation — fanning out to
     every already-existing descendant table too, since Postgres no longer
     propagates schema changes through a real inheritance relationship.
     Every applied change is recorded to `MigrationLedger`.
- `defineTable()` also accepts a **decorated class** (see
  `TableSchemaDecorators`), reading its `__tableDefinition`.
- `dropTable()`, `deregisterTable()`.
- **Factories:** `table(name, context?)` returns a `Table`; `query()` returns a
  bare `Query`.

### `TransactionClient` (`src/TransactionClient.ts`)
A scoped peer of `ORMClient` for use inside `ORMClient.transaction()`. Shares
the same `RegistriesHandler`/`Logger` but is constructed with an
`IConnectable` that always resolves to the transaction's single reserved
connection. Exposes only `table()`/`query()` (DML) — no DDL.

### `Table` (`src/table/Table.ts`)
The primary object-mapping API for a single table. **Extends
`TableDefinitionHandler`**, so it is both a schema descriptor and a query/record
gateway. Responsibilities:

- **Record factories:** `createNewRecord()` (new, unsaved) and
  `convertRawRecordToRecord(raw)` (hydrate a DB row).
- **Fluent query surface:** `where` / `andWhere` / `orWhere`, `limit`, `offset`,
  `orderBy`, `with(columnName)` — each delegates to an internal `Query` (or,
  for `with()`, records an eager-load column) and returns `this` for chaining.
- **Terminal operations:** `toArray()` (materialize to `Record[]`, running any
  eager-loads), `execute()` (returns an async-generator **cursor** factory for
  streaming — throws if `.with()` was used, since eager-loading needs the
  full result set up front), `count()`, `getRecord(idOrColumnOrFilter, value?)`.
- **Inheritance-aware reads:** before each terminal read, `#refreshQueryTables()`
  re-resolves `this.getName()` plus `this.getDescendantTables()` (descendants
  can be registered after this `Table` was constructed) and hands them to
  `Query.from()`, which builds a `UNION ALL` across all of them when there's
  more than one.
- **Relation eager-loading:** `with(columnName)` validates the column has a
  `foreign_key`, then after the primary read, `#loadRelations()` collects the
  distinct FK values across the batch and issues one extra query
  (`WHERE fk_column IN (...)`) against the related table, attaching results
  via `Record.setRelated()`. Not a SQL join — this composes for free with the
  related table's own `UNION ALL` inheritance read, if it has one.
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
(per row); eager-loaded relations are attached *after* interception, so
interceptors never see related records.

### `Record` (`src/record/Record.ts`)
A single row instance ("active record" style). Responsibilities:

- Holds the raw record map (`#record`), a modified-columns set
  (`#columnsModified`), a related-records map (`#related`), and an `#isNew`
  flag.
- **Value access:** `set(key, value)` (runs the data type's
  `setValueIntercept`), `get(key)`, `getJSONValue(key)`, `toJSON(columns?)`.
- **Relations:** `setRelated(columnName, record)` / `getRelated(columnName)`
  — populated by `Table` after an eager-load, not called directly.
- **Persistence:** `insert()`, `update()`, `delete()` — each wraps the operation
  in `BEFORE_*` / `AFTER_*` interception, validates fields, builds the SQL via
  its own `Query`, executes it, and rehydrates from the `RETURNING *` row.
  `update()`/`delete()` target the record's own `_table` column (the concrete
  physical table it actually lives on) rather than the table it was queried
  through, so mutating a row fetched via an ancestor's polymorphic read still
  reaches the right table.
- **Validation (`#validateRecord`):** iterates columns and calls each data type's
  `validateValue`, collecting `FieldValidationError`s into a `RecordSaveError`.
- On `createNewRecord()`, `#initialize()` seeds defaults and auto-assigns `id`
  (UUID) and `_table`.

---

## 3. Registries (`src/RegistriesHandler.ts`, `src/Registry.ts`)

`Registry<T>` is a generic `Map`-backed store keyed by a `getKey(item)`
function, with a `values()` accessor for full enumeration. `RegistriesHandler`
composes three registries and is the single source of truth shared across the
ORM:

| Registry                        | Key                      | Holds                        |
|---------------------------------|--------------------------|------------------------------|
| table definition registry       | short-form table name    | `TTableDefinitionStrict`     |
| data type registry              | data type name           | `IDataType`                  |
| operation interceptor *service* | interceptor name         | `RecordInterceptor` (via `DatabaseOperationInterceptorService`) |

`RegistriesHandler.getAllTableDefinitions()` (backed by `Registry.values()`)
is what lets `TableDefinitionHandler.getDescendantTables()` scan every
registered table for descendants of a given one. `RegistriesHandler.intercept(...)`
is a thin delegate to the interceptor service. Because the same handler
instance is injected from `ORM` → `ORMClient`/`TransactionClient` → `Table`,
registering a type/interceptor/table anywhere makes it available everywhere.

---

## 4. Schema & data-type subsystem

### Table definition (`src/table/TableDefinitionHandler.ts`)
- Normalizes a `TTableDefinition` → `TTableDefinitionStrict` via `setDefaults`
  (defaults `schema="public"`, `final=false`, empty `columns`/`unique`/`index`,
  empty `renames`, `allowDestructiveMigrations=false`).
- Wraps each column in a `Column`.
- **Inheritance resolution (application-level, not native Postgres
  `INHERITS`):** `getColumns()` merges own columns with the parent table's
  columns (looked up recursively from the registry) — every concrete table
  physically declares its *full* merged column set. `getExtendedTables()`
  walks *up* the chain (self → ancestors); `getDescendantTables()` walks
  *down* by scanning every registered definition for ones whose
  `getExtendedTables()` includes this table.
- Auto-injects `id` (uuid, unique, not-null) and `_table` (string) columns on
  **root** tables only (descendants inherit them into their own merged set).
- `getUniqueConstraints()` / `getIndexes()` — table-level groups plus any
  per-column `unique`/`index: true` flags folded in from the merged column
  set, so a flag declared on an ancestor column still applies to every
  concrete descendant table.
- `getRenames()` / `allowsDestructiveMigrations()` — opt-in migration
  behavior read by `ORMClient#alterTableIfNeeded()`.
- `validate()` checks table-name format, inheritance validity (parent exists,
  parent not `final`), per-column validity, and duplicate columns; throws
  `TableDefinitionError`.

Polymorphic reads (querying an ancestor and getting descendant rows back) are
reproduced by `Table`/`SelectQuery` via `UNION ALL` across the table and its
descendants (see §6) — not by Postgres's own inheritance-aware scan, since
native `INHERITS` doesn't enforce `UNIQUE`/`PRIMARY KEY`/`FOREIGN KEY`
constraints across a hierarchy and would tie every table in a hierarchy to
one schema.

### Columns (`src/table/Column.ts`, `src/table/ColumnDefinitionHandler.ts`)
- `ColumnDefinitionHandler` normalizes column defaults and exposes accessors
  (`isUnique`, `isIndexed`, `isNotNull`, `getNativeType`, `getDefaultValue`,
  `getColumnType`) and `validate()`.
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
`src/migration/typeMapping.ts` maps each built-in `TColumnDataType` to the
string Postgres reports back in `information_schema.columns.data_type`, used
for migration type-change detection — custom types are skipped there, since
there's no reliable way to map an arbitrary custom native type back.

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
`Query` (`src/query/Query.ts`) is a stateful facade owning an `IConnectable`
(a `DatabaseConnectionPool`, or a `TransactionConnection` inside a
transaction). It exposes a unified fluent API
(`select/insert/update/delete/create/alter` + clause methods) that internally
instantiates and delegates to the appropriate builder object, then:

- `getSQLQuery()` — builds the final SQL string.
- `execute(sql?)` — reserves a connection via `IConnectable.connect()`, runs
  the SQL, releases it.
- `cursor()` — for `SELECT`, opens a `pg-cursor` for streaming reads.

### `src/core/query-builder/` — SQL builders
Pure, connection-agnostic SQL string builders, all implementing `IQuery`
(`{ buildQuery(): string }`):

- **DQL:** `DQL/SelectQuery.ts` — for a single table, an ordinary
  `SELECT ... FROM ...`; for a table with descendants, builds one branch per
  table (same columns/`WHERE`) joined with `UNION ALL`, applying
  `GROUP BY`/`ORDER BY`/`LIMIT`/`OFFSET` once at the outer level. Every
  branch is assembled unrendered and rendered in a single final `pgFormat()`
  call, to avoid re-escaping already-rendered SQL text.
- **DML:** `DML/InsertQuery.ts`, `UpdateQuery.ts`, `DeleteQuery.ts`
- **DDL:** `DDL/CreateQuery.ts`, `AlterQuery.ts` — `CREATE TABLE`/
  `ALTER TABLE ... ADD COLUMN` plus inline `UNIQUE`/`ADD UNIQUE` and
  `PRIMARY KEY`. Non-unique indexes and migration-specific DDL (`RENAME
  COLUMN`, `DROP COLUMN`, `ALTER COLUMN TYPE`) are **not** built here — they're
  single-statement, ad-hoc `pgFormat` + `runSQLQuery` calls issued directly
  from `ORMClient`, since real `CREATE INDEX` can't be inlined into a
  `CREATE TABLE`/`ALTER TABLE` statement the way `UNIQUE` can.
- **CLAUSES:** `WhereClause`, `OrderByClause`, `GroupByClause`, `LimitClause`,
  `OffsetClause`, `ColumnsListClause` (all implement `IClause`, exposing
  `prepareStatement()`).
- **EXPRESSIONS:** `SimpleExpression` (a single `column operator value`) and
  `CompoundExpression` (AND/OR trees). `WhereClause.where(fn)` accepts a
  callback to build nested compound expressions.
- **`PreparedStatement`** / `TPreparedStatement` — an intermediate
  `{ sql, values }` shape. Builders assemble parameterized fragments (`%I`, `%L`,
  `%s`) that are finally rendered by **`pg-format`**, which handles SQL
  identifier/literal escaping. Every ad-hoc SQL string built outside the
  query-builder classes (in `ORMClient`, `DatabaseClient`,
  `DatabaseConnectionPool`) follows the same `pgFormat` convention rather than
  raw string interpolation, to close off SQL-injection risk.

**Operator model:** `src/core/types.ts` defines
`WHERE_CLAUSE_OPERATORS_CONFIG` — the full operator set (`=`, `!=`, `LIKE`,
`IN`, `BETWEEN`, `IS NULL`, etc.) plus metadata flags (`arrayValues`,
`noValue`). `SimpleExpression` uses these to normalize shorthand calls
(`where("age", 10)` → `=`), route array operators (`IN`), value-less operators
(`IS NULL`), and translate `= null` → `IS NULL`.

---

## 7. Connection layer (`src/core/connection/`)

- **`IConnectable`** — `{ connect(): Promise<DatabaseClient> }`. Implemented by:
  - **`DatabaseConnectionPool`** — wraps a `pg.Pool`; `connect()` reserves a
    fresh client each call. Also provides `testConnection()`, `createDatabase()`,
    `dropDatabase()`, `executeQuery()`, `end()`. Maps Postgres error code
    `3D000` to `ORMError.databaseDoesNotExistsError`.
  - **`TransactionConnection`** — wraps one already-open `DatabaseClient`;
    `connect()` always resolves to that same instance, so every `Query`/
    `Table` operation inside a transaction shares one physical connection.
- **`DatabaseClient`** wraps a single checked-out `pg.Client`: `executeQuery()`,
  `createCursor()` (via `pg-cursor`), schema helpers, `release()`. Constructed
  with an optional `{ releasable?: boolean }` (default `true`); `release()`
  only closes the underlying `pg.Client` when `releasable` is true.
  `withNonReleasingHandle()` returns a second `DatabaseClient` over the same
  underlying `pg.Client` with `releasable: false` — used inside a transaction
  so per-operation `.release()` calls no-op until the transaction itself
  releases the real connection once, in `ORMClient.transaction()`'s `finally`.

Outside a transaction, individual queries reserve a client via
`IConnectable.connect()`, run, and release it in `finally`/after execution —
one reservation per operation, same as before transactions existed.

---

## 8. Migration subsystem (`src/migration/`)

Not a full migration-file system — no version numbers, no down-migrations.
Two responsibilities:

- **`MigrationLedger`** — `ensureLedgerTable(client)` lazily creates
  `public._orm_migrations` (`id`, `table_name`, `change_type`, `detail` jsonb,
  `applied_at`); `record(client, entry)` inserts one audit row. Called by
  `ORMClient` after every DDL change it actually applies (`CREATE_TABLE`,
  `ADD_COLUMN`, `RENAME_COLUMN`, `ALTER_COLUMN_TYPE`, `DROP_COLUMN`,
  `ADD_UNIQUE`, `ADD_INDEX` — see `TMigrationChangeType`).
- **`typeMapping.ts`** — `NATIVE_TYPE_TO_INFORMATION_SCHEMA_TYPE`, used to
  detect when a column's declared type no longer matches what's physically in
  Postgres, so `#alterTableIfNeeded()` can attempt a best-effort
  `ALTER COLUMN ... TYPE ... USING ...` (logged, not aborted, on cast
  failure). Only covers the 10 built-in types.

`renames`/`allowDestructiveMigrations` (on `TTableDefinition`) and the
type-change/drop detection live in `ORMClient#alterTableIfNeeded()`
(§2), which runs renames first (so a rename isn't mistaken for a drop-plus-add),
then the existing add-column diff, then type changes, then opt-in drops, then
unique constraints, then indexes — recording each to the ledger.

---

## 9. Errors (`src/errors/`)

- `ORMError` — base error with a typed `code`
  (`GENERAL`, `DATABASE_DOES_NOT_EXISTS`, `QUERY`,
  `TABLE_DEFINITION_VALIDATION`, `RECORD_VALIDATION`) and static throwers.
- `TableDefinitionError` — aggregates schema validation failures.
- `FieldValidationError` — a single field's validation failure.
- `RecordSaveError` — wraps insert/update/delete failures and collects
  `FieldValidationError`s.

---

## 10. Cross-cutting utilities

- **`src/utils.ts`** — `runSQLQuery`, `logSQLQuery` (debug logging via
  `pg-minify`), table-name helpers (`getFullFormTableName`,
  `getSchemaAndTableName`, `getShortFormTableName`), `generateUUID` /
  `validateUUID`, `findDuplicates`, `isEqualArray`.
- **`deps.ts`** — the single dependency barrel: `pg`, `pg-cursor`, `pg-format`,
  `pg-minify`, `@std/uuid`, `@std/crypto`, `@redvars/log`
  (`defaultLogManager`, `Logger`), `@opentelemetry/api` (`trace`, `context`,
  `SpanStatusCode`), plus JSON/`UUID4` types from `@utility/types`.
- **Logging** — a `Logger` is threaded from `ORM` down through `ORMClient`/
  `TransactionClient`, `Table`, and `Record`; SQL is logged at `DEBUG` level,
  destructive-migration warnings at `WARN`. Falls back to
  `@redvars/log`'s `defaultLogManager.getLogger(...)` when no `Logger` is
  injected; `ORM` itself has no opinion on how an injected `Logger` was built
  otherwise.
- **Transaction tracing** — `ORMClient.transaction()` opens an OTel span
  (`trace.getTracer("@redvars/orm").startSpan("orm.transaction")`) and binds
  the `TransactionClient`'s `Logger` to that span's context via
  `Logger.withContext()`, so every log line emitted during the transaction
  (including `logSQLQuery`/`runSQLQuery` calls from `Table`/`Record`/`Query`,
  unchanged) correlates with it in any OTel-compatible backend. Works with
  zero tracing SDK configured — `@opentelemetry/api` alone provides safe
  no-op tracers/spans — so this never forces a tracing backend on consumers.

---

## 11. Typical request flows

### Define a table
```
ORMClient.defineTable(def)
  → TableDefinitionHandler.validate()
  → RegistriesHandler.addTableDefinition()
  → MigrationLedger.ensureLedgerTable() + ensure schema exists
  → Query.create()/alter()  (CreateQuery / AlterQuery → SQL)
    (alter path: renames → add columns → type changes → opt-in drops →
     unique constraints, fanning out to existing descendant tables)
  → #ensureIndexes()  (CREATE INDEX for any declared, not-yet-existing index)
  → MigrationLedger.record() per applied change
  → IConnectable.connect() → DatabaseClient.executeQuery()
```

### Insert a record
```
table.createNewRecord()  →  record.set(...)  →  record.insert()
  → intercept BEFORE_INSERT
  → #validateRecord() (per-column IDataType.validateValue)
  → Query.insert().into().columns().values().returning('*')
  → execute (via IConnectable)
  → rehydrate from RETURNING row
  → intercept AFTER_INSERT
```

### Query records (with optional inheritance + relations)
```
table.where(...).orderBy(...).with('fk_column').toArray()
  → intercept BEFORE_SELECT
  → #refreshQueryTables() (self + current descendants)
  → SelectQuery.buildQuery() → UNION ALL across tables if >1 → pg-format → SQL
  → execute
  → each row → convertRawRecordToRecord() → intercept AFTER_SELECT
  → #loadRelations(): one batched IN-query against the related table,
    Record.setRelated() per row
```

### Run a transaction
```
client.transaction(async (tx) => { ... })
  → pool.connect() (one DatabaseClient) → BEGIN
  → TransactionClient wraps a TransactionConnection over
    client.withNonReleasingHandle()
  → tx.table(...)/tx.query(...) — every operation shares the one connection
  → COMMIT on success / ROLLBACK + rethrow on error
  → client.release() exactly once, in `finally`
```

---

## 12. Testing & tooling

- **Tests** (`test/`): unit tests (connection — including transactions,
  schema — create/index/migration, query — insert/select/relation, intercept,
  custom-field-type), a shared `test.utils.ts` (`Session` singleton), and DB
  `setUp`/`tearDown` scripts. Run via `deno task test` (setUp → `test:unit` →
  tearDown).
- **Coverage:** `deno task coverage` produces LCOV under `dist/coverage`.
- **Performance/benchmarks:** `test/performance/` (plain + worker-based) and
  `deno task bench`.
- **Examples** (`examples/`): runnable end-to-end scripts mirroring the README
  — connection, define+query, interception, custom types, inheritance,
  cross-schema references, transactions, indexes, migrations, relations.
- **CI:** `.github/workflows/` (`test.yml`, `publish.yml`); published to JSR as
  `@redvars/orm`.

---

## 13. Key design characteristics

- **Single shared registry** wires schema, data types, and interceptors across
  every layer without a global singleton.
- **Active-record** style: `Record` instances know how to persist themselves,
  and route mutations to their true owning physical table via `_table`.
- **Layered query building:** a stateful `Query` facade over pure, testable SQL
  builders that emit parameterized fragments escaped by `pg-format`.
- **Application-level polymorphism:** table inheritance is reproduced via
  `UNION ALL` across concrete, independently-schema-placeable tables, each
  with its own fully-enforced constraints — not native Postgres `INHERITS`.
- **Extensibility seams:** custom `IDataType`s and `RecordInterceptor`s are
  first-class runtime registrations; `IConnectable` lets `Query`/`Table`
  transparently run against either a pool or a single transaction connection.
- **Audit over automation** for migrations: additive changes are automatic,
  anything destructive is opt-in and logged, and every applied change is
  recorded rather than silently made.
- **Postgres-native features** are leveraged directly: schemas, triggers,
  cursors, `pg_indexes`/`information_schema` introspection.
- **Deno-first:** private fields, `Temporal` for date/time types, and
  `jsr:`/`npm:` imports centralized in `deps.ts`.
