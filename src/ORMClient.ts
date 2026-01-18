import type { Logger } from "../deps.ts";
import type {
  TRecordInterceptorContext,
  TTableDefinition,
  TTableDefinitionStrict,
} from "./types.ts";
import DatabaseConnectionPool from "./core/connection/DatabaseConnectionPool.ts";
import type { TDatabaseConfiguration } from "./core/types.ts";
import TableDefinitionHandler from "./table/TableDefinitionHandler.ts";

import Table from "./table/Table.ts";

import Query from "./query/Query.ts";
import { isEqualArray, logSQLQuery, runSQLQuery } from "./utils.ts";
import type RegistriesHandler from "./RegistriesHandler.ts";
import ORMError from "./errors/ORMError.ts";

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
      const [{ exists: schemaExists }] = await runSQLQuery(
        reserved,
        `SELECT EXISTS(SELECT
                       FROM information_schema.schemata
                       WHERE schema_name = '${tableDefinitionHandler.getSchemaName()}'
          LIMIT 1);`,
      );

      if (!schemaExists) {
        await runSQLQuery(
          reserved,
          `CREATE SCHEMA IF NOT EXISTS "${tableDefinitionHandler.getSchemaName()}";`,
        );
        this.#logger.info(
          `Schema ${tableDefinitionHandler.getSchemaName()} created`,
        );
      }

      const [{ exists: tableExists }] = await runSQLQuery(
        reserved,
        `SELECT EXISTS(SELECT
                       FROM information_schema.tables
                       WHERE table_name = '${tableDefinitionHandler.getTableName()}'
                         AND table_schema = '${tableDefinitionHandler.getSchemaName()}'
          LIMIT 1);`,
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

        const inherits = tableDefinitionHandler.getInherits();
        if (inherits) {
          createQuery.inherits(inherits);
        }
        logSQLQuery(this.#logger, createQuery.getSQLQuery());
        await createQuery.execute();
      } else {
        const columns = await runSQLQuery(
          reserved,
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = '${tableDefinitionHandler.getSchemaName()}'
             AND table_name = '${tableDefinitionHandler.getTableName()}';`,
        );
        const existingColumnNames = columns.map(
          (column: { column_name: string }) => column.column_name,
        );
        const columnSchemas = tableDefinitionHandler.getOwnColumns();

        const alterQuery = new Query(this.#pool);
        alterQuery.alter(tableDefinitionHandler.getName());

        let runAlterQuery = false;
        // Create new columns
        if (columnSchemas.length > existingColumnNames.length) {
          for (const column of tableDefinitionHandler.getColumns()) {
            const columnDefinition = column.getDefinitionClone();
            if (!existingColumnNames.includes(column.getName())) {
              runAlterQuery = true;
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

        const existingUniqueConstraintColumns = await runSQLQuery(
          reserved,
          `SELECT constraint_name, column_name FROM information_schema.constraint_column_usage
          WHERE constraint_name IN (
            SELECT constraint_name FROM information_schema.table_constraints
          WHERE table_schema='public' AND table_name='department' AND constraint_type='UNIQUE'
        );`,
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

        if (existingUniqueConstraints.length) {
          const uniqueConstraints = tableDefinitionHandler
            .getUniqueConstraints();

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
              alterQuery.addUnique(unique);
            }
          }
        }

        if (runAlterQuery) {
          logSQLQuery(this.#logger, alterQuery.getSQLQuery());
          await alterQuery.execute();
        }
      }
    } finally {
      reserved.release();
    }
  }

  async dropTable(tableName: string): Promise<void> {
    const reserved = await this.#pool.connect();
    try {
      await runSQLQuery(
        reserved,
        `DROP TABLE IF EXISTS "${tableName}" CASCADE;`,
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
    const tableDefinition: TTableDefinitionStrict | undefined = this
      .#registriesHandler.getTableDefinition(name);
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
