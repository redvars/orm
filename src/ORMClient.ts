import { context, type Logger, pgFormat, SpanStatusCode, trace } from "../deps.ts";
import type {
  TColumnDataType,
  TRecordInterceptorContext,
  TTableDefinition,
  TTableDefinitionStrict,
} from "./types.ts";
import DatabaseConnectionPool from "./core/connection/DatabaseConnectionPool.ts";
import type { DatabaseClient } from "./core/connection/DatabaseClient.ts";
import TransactionConnection from "./core/connection/TransactionConnection.ts";
import type { TDatabaseConfiguration } from "./core/types.ts";
import TableDefinitionHandler from "./table/TableDefinitionHandler.ts";

import Table from "./table/Table.ts";
import TransactionClient from "./TransactionClient.ts";

import Query from "./query/Query.ts";
import {
  getSchemaAndTableName,
  isEqualArray,
  logSQLQuery,
  runSQLQuery,
} from "./utils.ts";
import type RegistriesHandler from "./RegistriesHandler.ts";
import ORMError from "./errors/ORMError.ts";
import MigrationLedger from "./migration/MigrationLedger.ts";
import { NATIVE_TYPE_TO_INFORMATION_SCHEMA_TYPE } from "./migration/typeMapping.ts";

type TExistingColumn = { column_name: string; data_type: string };

/**
 * The main class for interacting with the database.
 * It provides methods for creating, dropping, and interacting with tables.
 * It also provides methods for creating and executing queries.
 * It is the main entry point for the ORM.
 *
 * @example
 * ```typescript
 * import { ORMClient } from "@redvars/orm";
 * const connection: ORMClient = odm.connect();
 * const table = connection.table("users");
 * ```
 */
export default class ORMClient {
  readonly #config: TDatabaseConfiguration;
  readonly #pool: DatabaseConnectionPool;
  readonly #registriesHandler: RegistriesHandler;
  readonly #logger: Logger;
  readonly #migrationLedger = new MigrationLedger();

  constructor(
    logger: Logger,
    config: TDatabaseConfiguration,
    registriesHandler: RegistriesHandler,
  ) {
    this.#logger = logger;
    this.#config = config;
    this.#pool = new DatabaseConnectionPool(config, logger);
    this.#registriesHandler = registriesHandler;
  }

  async testConnection(): Promise<void> {
    return await this.#pool.testConnection();
  }

  closeConnection(): void {
    this.#pool.end();
  }

  /**
   * Runs `callback` against a single reserved connection wrapped in
   * `BEGIN`/`COMMIT`, rolling back and rethrowing on any error. The
   * `TransactionClient` passed to `callback` only exposes `table()`/`query()`
   * (DML) - `defineTable()`/`dropTable()` (DDL) are not supported inside a
   * transaction in this release, since they manage their own connection
   * reservation internally.
   *
   * The whole transaction runs inside its own OTel span, and the `Logger`
   * handed to `TransactionClient` (and everything built from it - `Table`,
   * `Record`, SQL debug logging) is bound to that span's context via
   * `Logger.withContext()`, so every log line emitted during the transaction
   * correlates with it in any OTel-compatible backend. This works even with
   * no tracing SDK configured - `@opentelemetry/api` provides safe no-op
   * tracers/spans, so nothing here forces a tracing backend on consumers.
   */
  async transaction<T>(
    callback: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.#pool.connect();
    await client.executeQuery("BEGIN");

    const span = trace.getTracer("@redvars/orm").startSpan("orm.transaction");
    const txContext = trace.setSpan(context.active(), span);
    const txLogger = this.#logger.withContext(txContext);

    const tx = new TransactionClient(
      new TransactionConnection(client.withNonReleasingHandle()),
      this.#registriesHandler,
      txLogger,
    );
    try {
      const result = await context.with(txContext, () => callback(tx));
      await client.executeQuery("COMMIT");
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      try {
        await client.executeQuery("ROLLBACK");
      } catch (rollbackErr) {
        this.#logger.error(rollbackErr);
      }
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
      throw err;
    } finally {
      span.end();
      client.release();
    }
  }

  async dropDatabase(): Promise<any> {
    const databaseName = this.#pool.getDatabaseName();
    if (!databaseName) {
      throw ORMError.generalError("Database name is not defined");
    }
    this.closeConnection();
    const tempClient = new DatabaseConnectionPool(
      {
        ...this.#config,
        database: "postgres",
      },
      this.#logger,
    );
    await tempClient.testConnection();
    try {
      const result = await tempClient.dropDatabase(databaseName);
      tempClient.end();
      return result;
    } catch (error) {
      tempClient.end();
      throw error;
    }
  }

  deregisterTable(tableName: string) {
    this.#registriesHandler.deleteTableDefinition(tableName);
  }

  async defineTable(tableDefinitionRaw: TTableDefinition | Function) {
    if (typeof tableDefinitionRaw === "function") {
      // @ts-ignore
      tableDefinitionRaw = tableDefinitionRaw.__tableDefinition;
    }
    const tableDefinitionHandler = new TableDefinitionHandler(
      tableDefinitionRaw,
      this.#registriesHandler,
    );

    tableDefinitionHandler.validate();

    this.#registriesHandler.addTableDefinition(
      tableDefinitionHandler.getDefinitionClone(),
    );

    const reserved = await this.#pool.connect();
    try {
      await this.#migrationLedger.ensureLedgerTable(reserved);

      const [{ exists: schemaExists }] = await runSQLQuery(
        reserved,
        pgFormat(
          `SELECT EXISTS(SELECT
                       FROM information_schema.schemata
                       WHERE schema_name = %L
          LIMIT 1);`,
          tableDefinitionHandler.getSchemaName(),
        ),
      );

      if (!schemaExists) {
        await runSQLQuery(
          reserved,
          pgFormat(
            `CREATE SCHEMA IF NOT EXISTS %I;`,
            tableDefinitionHandler.getSchemaName(),
          ),
        );
        this.#logger.info(
          `Schema ${tableDefinitionHandler.getSchemaName()} created`,
        );
      }

      const tableExists = await this.#tableExists(
        reserved,
        tableDefinitionHandler,
      );

      if (!tableExists) {
        const createQuery = new Query(this.#pool);
        createQuery.create(tableDefinitionHandler.getName());
        for (const column of tableDefinitionHandler.getColumns()) {
          const columnDefinition = column.getDefinitionClone();
          createQuery.addColumn({
            table: column.getTableName(),
            name: column.getName(),
            native_type: column.getNativeType(),
            not_null: column.isNotNull(),
            unique: column.isUnique(),
            foreign_key: columnDefinition.foreign_key,
          });
        }
        for (const unique of tableDefinitionHandler.getUniqueConstraints()) {
          createQuery.addUnique(unique);
        }

        logSQLQuery(this.#logger, createQuery.getSQLQuery());
        await createQuery.execute();
        await this.#migrationLedger.record(reserved, {
          tableName: tableDefinitionHandler.getName(),
          changeType: "CREATE_TABLE",
        });
        await this.#ensureIndexes(reserved, tableDefinitionHandler);
      } else {
        await this.#alterTableIfNeeded(reserved, tableDefinitionHandler);

        // Postgres no longer propagates newly added ancestor columns to
        // descendant tables (there is no physical INHERITS relation), so any
        // already-existing descendant table must be altered here too.
        for (
          const descendantName of tableDefinitionHandler.getDescendantTables()
        ) {
          const descendantDefinition = this.#registriesHandler
            .getTableDefinition(descendantName);
          if (!descendantDefinition) continue;
          const descendantHandler = new TableDefinitionHandler(
            descendantDefinition,
            this.#registriesHandler,
          );
          if (await this.#tableExists(reserved, descendantHandler)) {
            await this.#alterTableIfNeeded(reserved, descendantHandler);
          }
        }
      }
    } finally {
      reserved.release();
    }
  }

  async #tableExists(
    reserved: DatabaseClient,
    tableDefinitionHandler: TableDefinitionHandler,
  ): Promise<boolean> {
    const [{ exists }] = await runSQLQuery(
      reserved,
      pgFormat(
        `SELECT EXISTS(SELECT
                     FROM information_schema.tables
                     WHERE table_name = %L
                       AND table_schema = %L
        LIMIT 1);`,
        tableDefinitionHandler.getTableName(),
        tableDefinitionHandler.getSchemaName(),
      ),
    );
    return exists;
  }

  async #alterTableIfNeeded(
    reserved: DatabaseClient,
    tableDefinitionHandler: TableDefinitionHandler,
  ): Promise<void> {
    let columns: TExistingColumn[] = await runSQLQuery(
      reserved,
      pgFormat(
        `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = %L
         AND table_name = %L;`,
        tableDefinitionHandler.getSchemaName(),
        tableDefinitionHandler.getTableName(),
      ),
    );

    // Renames must run first, and update `columns` in place, so a renamed
    // column isn't mistaken for "dropped old + added new" by the diffing
    // below.
    columns = await this.#processRenames(reserved, tableDefinitionHandler, columns);

    const existingColumnNames = columns.map((column) => column.column_name);
    // Every table now physically declares its full merged column set (own +
    // inherited), so the "does this table need new columns" comparison must
    // use the merged list, not just this table's own columns.
    const columnSchemas = tableDefinitionHandler.getColumns();

    const alterQuery = new Query(this.#pool);
    alterQuery.alter(tableDefinitionHandler.getName());

    let runAlterQuery = false;
    const addedColumnNames: string[] = [];
    // Create new columns
    if (columnSchemas.length > existingColumnNames.length) {
      for (const column of tableDefinitionHandler.getColumns()) {
        const columnDefinition = column.getDefinitionClone();
        if (!existingColumnNames.includes(column.getName())) {
          runAlterQuery = true;
          addedColumnNames.push(column.getName());
          alterQuery.addColumn({
            table: column.getTableName(),
            name: column.getName(),
            native_type: column.getNativeType(),
            not_null: column.isNotNull(),
            unique: column.isUnique(),
            foreign_key: columnDefinition.foreign_key,
          });
        }
      }
    }

    await this.#processColumnTypeChanges(reserved, tableDefinitionHandler, columns);
    await this.#processDroppedColumns(reserved, tableDefinitionHandler, columns);

    const existingUniqueConstraintColumns = await runSQLQuery(
      reserved,
      pgFormat(
        `SELECT constraint_name, column_name FROM information_schema.constraint_column_usage
      WHERE constraint_name IN (
        SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_schema=%L AND table_name=%L AND constraint_type='UNIQUE'
    );`,
        tableDefinitionHandler.getSchemaName(),
        tableDefinitionHandler.getTableName(),
      ),
    );

    let existingUniqueConstraints: any = {};

    existingUniqueConstraintColumns.forEach((constraint: any) => {
      existingUniqueConstraints[constraint.constraint_name] =
        existingUniqueConstraints[constraint.constraint_name] || [];

      existingUniqueConstraints[constraint.constraint_name].push(
        constraint.column_name,
      );
    });

    existingUniqueConstraints = Object.values(existingUniqueConstraints);

    const addedUniqueGroups: string[][] = [];
    if (existingUniqueConstraints.length) {
      const uniqueConstraints = tableDefinitionHandler.getUniqueConstraints();

      for (const unique of uniqueConstraints) {
        let exists = false;
        for (const existingUniqueConstraint of existingUniqueConstraints) {
          if (isEqualArray(existingUniqueConstraint, unique)) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          runAlterQuery = true;
          addedUniqueGroups.push(unique);
          alterQuery.addUnique(unique);
        }
      }
    }

    if (runAlterQuery) {
      logSQLQuery(this.#logger, alterQuery.getSQLQuery());
      await alterQuery.execute();
      for (const name of addedColumnNames) {
        await this.#migrationLedger.record(reserved, {
          tableName: tableDefinitionHandler.getName(),
          changeType: "ADD_COLUMN",
          detail: { column: name },
        });
      }
      for (const group of addedUniqueGroups) {
        await this.#migrationLedger.record(reserved, {
          tableName: tableDefinitionHandler.getName(),
          changeType: "ADD_UNIQUE",
          detail: { columns: group },
        });
      }
    }

    await this.#ensureIndexes(reserved, tableDefinitionHandler);
  }

  async #processRenames(
    reserved: DatabaseClient,
    tableDefinitionHandler: TableDefinitionHandler,
    columns: TExistingColumn[],
  ): Promise<TExistingColumn[]> {
    const renames = tableDefinitionHandler.getRenames();
    const existingNames = new Set(columns.map((column) => column.column_name));

    for (const [oldName, newName] of Object.entries(renames)) {
      if (!existingNames.has(oldName) || existingNames.has(newName)) continue;

      const sql = pgFormat(
        `ALTER TABLE %I.%I RENAME COLUMN %I TO %I`,
        tableDefinitionHandler.getSchemaName(),
        tableDefinitionHandler.getTableName(),
        oldName,
        newName,
      );
      logSQLQuery(this.#logger, sql);
      await runSQLQuery(reserved, sql);

      const column = columns.find((c) => c.column_name === oldName);
      if (column) column.column_name = newName;
      existingNames.delete(oldName);
      existingNames.add(newName);

      await this.#migrationLedger.record(reserved, {
        tableName: tableDefinitionHandler.getName(),
        changeType: "RENAME_COLUMN",
        detail: { from: oldName, to: newName },
      });
    }

    return columns;
  }

  async #processColumnTypeChanges(
    reserved: DatabaseClient,
    tableDefinitionHandler: TableDefinitionHandler,
    columns: TExistingColumn[],
  ): Promise<void> {
    const physicalTypeByName = new Map(
      columns.map((column) => [column.column_name, column.data_type]),
    );

    for (const column of tableDefinitionHandler.getColumns()) {
      const physicalType = physicalTypeByName.get(column.getName());
      if (!physicalType) continue; // not physically present yet (e.g. just added)

      const nativeType = column.getNativeType();
      const expectedType = (
        NATIVE_TYPE_TO_INFORMATION_SCHEMA_TYPE as Record<string, string>
      )[nativeType as TColumnDataType];
      // Unrecognized (custom-registered) native type - can't reliably map it
      // back to an information_schema type name, so skip type-change
      // detection for this column rather than guess.
      if (!expectedType || expectedType === physicalType) continue;

      const sql = pgFormat(
        `ALTER TABLE %I.%I ALTER COLUMN %I TYPE ${nativeType} USING %I::${nativeType}`,
        tableDefinitionHandler.getSchemaName(),
        tableDefinitionHandler.getTableName(),
        column.getName(),
        column.getName(),
      );
      try {
        logSQLQuery(this.#logger, sql);
        await runSQLQuery(reserved, sql);
        await this.#migrationLedger.record(reserved, {
          tableName: tableDefinitionHandler.getName(),
          changeType: "ALTER_COLUMN_TYPE",
          detail: { column: column.getName(), from: physicalType, to: nativeType },
        });
      } catch (error) {
        // Best-effort: a lossy/incompatible cast shouldn't abort the whole
        // defineTable() call.
        this.#logger.error(error);
      }
    }
  }

  async #processDroppedColumns(
    reserved: DatabaseClient,
    tableDefinitionHandler: TableDefinitionHandler,
    columns: TExistingColumn[],
  ): Promise<void> {
    const declaredNames = new Set(
      tableDefinitionHandler.getColumns().map((column) => column.getName()),
    );
    const droppedNames = columns
      .map((column) => column.column_name)
      .filter((name) => !declaredNames.has(name));
    if (!droppedNames.length) return;

    if (!tableDefinitionHandler.allowsDestructiveMigrations()) {
      this.#logger.warn(
        `Table '${tableDefinitionHandler.getName()}' has columns no longer in its definition (${
          droppedNames.join(", ")
        }) - not dropping since allowDestructiveMigrations is not set.`,
      );
      return;
    }

    for (const name of droppedNames) {
      const sql = pgFormat(
        `ALTER TABLE %I.%I DROP COLUMN %I`,
        tableDefinitionHandler.getSchemaName(),
        tableDefinitionHandler.getTableName(),
        name,
      );
      logSQLQuery(this.#logger, sql);
      await runSQLQuery(reserved, sql);
      await this.#migrationLedger.record(reserved, {
        tableName: tableDefinitionHandler.getName(),
        changeType: "DROP_COLUMN",
        detail: { column: name },
      });
    }
  }

  #buildIndexName(tableName: string, columns: string[]): string {
    return `idx_${tableName}_${columns.join("_")}`;
  }

  /**
   * Creates any declared (non-unique) indexes that don't already exist on
   * the physical table. Real indexes require their own `CREATE INDEX`
   * statement (unlike `UNIQUE`, they can't be inlined into `CREATE TABLE`'s
   * column list), so this runs independently after the table itself is
   * created or altered.
   */
  async #ensureIndexes(
    reserved: DatabaseClient,
    tableDefinitionHandler: TableDefinitionHandler,
  ): Promise<void> {
    const declaredIndexes = tableDefinitionHandler.getIndexes();
    if (!declaredIndexes.length) return;

    const existing = await runSQLQuery(
      reserved,
      pgFormat(
        `SELECT indexname FROM pg_indexes WHERE schemaname = %L AND tablename = %L;`,
        tableDefinitionHandler.getSchemaName(),
        tableDefinitionHandler.getTableName(),
      ),
    );
    const existingNames = new Set(
      existing.map((row: { indexname: string }) => row.indexname),
    );

    for (const columns of declaredIndexes) {
      const indexName = this.#buildIndexName(
        tableDefinitionHandler.getTableName(),
        columns,
      );
      if (existingNames.has(indexName)) continue;

      const placeholders = columns.map(() => "%I").join(", ");
      const sql = pgFormat(
        `CREATE INDEX IF NOT EXISTS %I ON %I.%I (${placeholders})`,
        indexName,
        tableDefinitionHandler.getSchemaName(),
        tableDefinitionHandler.getTableName(),
        ...columns,
      );
      logSQLQuery(this.#logger, sql);
      await runSQLQuery(reserved, sql);
      await this.#migrationLedger.record(reserved, {
        tableName: tableDefinitionHandler.getName(),
        changeType: "ADD_INDEX",
        detail: { indexName, columns },
      });
    }
  }

  async dropTable(tableName: string): Promise<void> {
    const reserved = await this.#pool.connect();
    try {
      const [schemaName, tableNameOnly] = getSchemaAndTableName(tableName);
      await runSQLQuery(
        reserved,
        pgFormat(
          `DROP TABLE IF EXISTS %I.%I CASCADE;`,
          schemaName,
          tableNameOnly,
        ),
      );
    } finally {
      reserved.release();
    }
  }

  /*
   * Get table object
   * @param name Table name
   * @param context Context object
   */
  table(name: string, context?: TRecordInterceptorContext): Table {
    const tableDefinition: TTableDefinitionStrict | undefined =
      this.#registriesHandler.getTableDefinition(name);
    if (typeof tableDefinition === "undefined") {
      throw new ORMError(
        "TABLE_DEFINITION_VALIDATION",
        `Table with name '${name}' is not defined`,
      );
    }
    return new Table(
      this.#pool,
      tableDefinition,
      this.#registriesHandler,
      this.#logger,
      context,
    );
  }

  query(): Query {
    return new Query(this.#pool);
  }
}
