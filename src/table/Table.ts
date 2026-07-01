import type { Logger, UUID4 } from "../../deps.ts";
import type {
  TRecord,
  TRecordInterceptorContext,
  TRecordInterceptorType,
  TTableDefinition,
} from "../types.ts";
import Record from "../record/Record.ts";
import Query from "../query/Query.ts";
import {
  getFullFormTableName,
  getShortFormTableName,
  logSQLQuery,
} from "../utils.ts";
import TableDefinitionHandler from "./TableDefinitionHandler.ts";
import type RegistriesHandler from "../RegistriesHandler.ts";
import { ORMError } from "../../mod.ts";
import type DatabaseConnectionPool from "../core/connection/DatabaseConnectionPool.ts";
import type WhereClause from "../core/query-builder/CLAUSES/WhereClause.ts";
import type {
  TOrderBy,
  TOrderByDirection,
  TWhereClauseOperator,
} from "../core/types.ts";

export default class Table extends TableDefinitionHandler {
  readonly #context?: TRecordInterceptorContext;
  readonly #logger: Logger;
  readonly #registriesHandler: RegistriesHandler;

  #query: Query;

  #disableIntercepts: boolean | string[] = false;

  readonly #pool: DatabaseConnectionPool;

  constructor(
    pool: DatabaseConnectionPool,
    tableDefinition: TTableDefinition,
    registriesHandler: RegistriesHandler,
    logger: Logger,
    context?: TRecordInterceptorContext,
  ) {
    super(tableDefinition, registriesHandler);
    this.#registriesHandler = registriesHandler;
    this.#logger = logger;
    this.#pool = pool;
    this.#context = context;
    this.#query = this.#initializeQuery();
  }

  static getFullFormTableName(name: string): string {
    return getFullFormTableName(name);
  }

  static getShortFormTableName(name: string): string {
    return getShortFormTableName(name);
  }

  getContext(): TRecordInterceptorContext | undefined {
    return this.#context;
  }

  createNewRecord(): Record {
    const query = new Query(this.#pool);
    query.select();
    query.from(this.getName());
    return new Record(query, this, this.#logger);
  }

  convertRawRecordToRecord(rawRecord: TRecord): Record {
    const query = new Query(this.#pool);
    query.select();
    query.from(this.getName());
    return new Record(query, this, this.#logger, rawRecord);
  }

  /**
   * This method is used to set the where clause for the table query.
   * @param {string | number | boolean | ((where: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {Query} The Table instance.
   */
  where(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): Table {
    this.#query.where(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  /**
   * This method is used to set the AND where clause. (same as where)
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {Table} The Table instance.
   */
  andWhere(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): Table {
    this.#query.andWhere(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  /**
   * This method is used to set the or where clause for the table query.
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {Query} The Query instance.
   */
  orWhere(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): Table {
    this.#query.orWhere(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  limit(limit: number): Table {
    this.#query.limit(limit);
    return this;
  }

  offset(offset: number): Table {
    this.#query.offset(offset);
    return this;
  }

  orderBy(
    columnNameOrOrderList?: string | TOrderBy[],
    direction?: TOrderByDirection,
  ): Table {
    this.#query.orderBy(columnNameOrOrderList, direction);
    return this;
  }

  async count(): Promise<number> {
    this.#refreshQueryTables();
    const sqlQuery = this.#query.getCountSQLQuery();
    logSQLQuery(this.#logger, sqlQuery);
    const [row] = await this.#query.execute(sqlQuery);
    return parseInt(row.count, 10);
  }

  /**
   * Execute the query and return cursor
   *
   * @example
   * ```typescript
   * const cursor = await table.select().execute();
   * for await (const record of cursor()) {
   *     console.log(record);
   * }
   * ```
   */
  async execute(): Promise<() => AsyncGenerator<Record, void, unknown>> {
    await this.intercept("BEFORE_SELECT", []);

    this.#refreshQueryTables();

    logSQLQuery(this.#logger, this.#query.getSQLQuery());

    const { cursor, reserve } = await this.#query.cursor();

    reserve.on("error", () => console.log("Error in event."));

    return ((table: Table) => {
      return async function* () {
        try {
          let rows = await cursor.read(1);
          while (rows.length > 0) {
            const [record] = await table.intercept("AFTER_SELECT", [
              table.convertRawRecordToRecord(rows[0]),
            ]);
            yield record;
            rows = await cursor.read(1);
          }
        } finally {
          reserve.release();
        }
      };
    })(this);
  }

  /**
   * Execute the query and return result as array
   *
   * @example
   * ```typescript
   * const records = await table.select().toArray();
   * for (const record of records) {
   *     console.log(record);
   * }
   * ```
   */
  async toArray(): Promise<Record[]> {
    await this.intercept("BEFORE_SELECT", []);

    this.#refreshQueryTables();

    logSQLQuery(this.#logger, this.#query.getSQLQuery());

    const rawRecords = await this.#query.execute();

    const records: Record[] = [];

    for (const row of rawRecords) {
      const [record] = await this.intercept("AFTER_SELECT", [
        this.convertRawRecordToRecord(row),
      ]);
      records.push(record);
    }
    return records;
  }

  /**
   * Get a record by its ID or a column name and value
   * @param idOrColumnNameOrFilter - The ID of the record or a column name and value
   * @param value - The value of the column
   * @returns The record or undefined if not found
   *
   * @example
   * ```typescript
   * const record = await table.getRecord('id', '123');
   * const record = await table.getRecord('123');
   * const record = await table.getRecord({id: '123'});
   * const record = await table.getRecord({id: '123', name: 'test'});
   * ```
   */
  async getRecord(
    idOrColumnNameOrFilter:
      | UUID4
      | string
      | {
        [key: string]: any;
      },
    value?: any,
  ): Promise<Record | undefined> {
    if (
      typeof idOrColumnNameOrFilter === "undefined" ||
      idOrColumnNameOrFilter === null
    ) {
      throw ORMError.generalError("ID or column name must be provided");
    }
    this.#query = this.#initializeQuery();
    if (
      typeof idOrColumnNameOrFilter == "string" &&
      typeof value === "undefined"
    ) {
      this.#query.where("id", idOrColumnNameOrFilter);
    } else if (typeof idOrColumnNameOrFilter == "object") {
      for (const key in idOrColumnNameOrFilter) {
        this.#query.where(key, idOrColumnNameOrFilter[key]);
      }
    } else {
      this.#query.where(idOrColumnNameOrFilter, value);
    }
    this.#query.limit(1);
    const [record] = await this.toArray();
    return record;
  }

  disableIntercepts(): void {
    this.#disableIntercepts = true;
  }

  enableIntercepts(): void {
    this.#disableIntercepts = false;
  }

  disableIntercept(interceptName: string): void {
    if (this.#disableIntercepts === true) return;
    if (this.#disableIntercepts === false) {
      this.#disableIntercepts = [];
    }
    this.#disableIntercepts.push(interceptName);
  }

  /**
   * Disable all triggers on the table
   */
  async disableAllTriggers() {
    const client = await this.#pool.connect();
    await client.executeQuery(
      `ALTER TABLE ${
        Table.getFullFormTableName(
          this.getName(),
        )
      } DISABLE TRIGGER ALL`,
    );
    client.release();
  }

  /**
   * Enable all triggers on the table
   */
  async enableAllTriggers() {
    const client = await this.#pool.connect();
    await client.executeQuery(
      `ALTER TABLE ${
        Table.getFullFormTableName(
          this.getName(),
        )
      } ENABLE TRIGGER ALL`,
    );
    client.release();
  }

  /*async bulkInsert(records: Record[]): Promise<Record[]> {
    records = await this.intercept(
      "CREATE",
      OPERATION_WHENS.BEFORE,
      records
    );

    for (const record of records) {
      await this.validateRecord(record.toJSON(), this.getContext());
    }

    const rawRecords = records.map((record) => record.toJSON());

    for (const record of records) {
      await this.validateRecord(record.toJSON(), this.getContext());
    }
    let savedRawRecords: RawRecord;
    const reserve = await this.#pool.reserve();
    try {
      const command = reserve`INSERT INTO ${reserve(
        this.getTableSchema().getFullName()
      )} ${reserve(rawRecords)} RETURNING *`;
      savedRawRecords = await command.execute();
    } catch (err) {
      reserve.release();
      this.#logger.error(err);
      /!* throw new RecordValidationError(
        this.getTableSchema().getDefinition(),
        "test",
        [],
        err.message
      );*!/
    } finally {
      reserve.release();
    }
    reserve.release();

    let savedRecords = savedRawRecords.map((savedRawRecord: RawRecord) => {
      return new Record(savedRawRecord, this);
    });
    savedRecords = await this.intercept(
      "CREATE",
      OPERATION_WHENS.AFTER,
      savedRecords
    );
    return savedRecords;
  }

  async bulkUpdate(records: Record[]): Promise<Record> {}

  async deleteRecords(records: Record[]): Promise<any> {
    records = await this.intercept(
      "DELETE",
      OPERATION_WHENS.BEFORE,
      records
    );

    const ids = records.map((record) => record.getID());

    const reserve = await this.#pool.reserve();
    try {
      const command = reserve`DELETE FROM ${reserve(
        this.getTableSchema().getFullName()
      )} where id in ${ids}`;
      await command.execute();
    } catch (err) {
      reserve.release();
      this.#logger.error(err);
      throw new RecordSaveError(
        this.getTableSchema().getDefinition(),
        "test",
        [],
        err.message
      );
    } finally {
      reserve.release();
    }

    await this.intercept(
      "DELETE",
      OPERATION_WHENS.AFTER,
      records
    );
  }*/

  /**
   * Intercepts table operation
   * @param operation - The operation type
   * @param records - The records
   * @returns The records
   */
  async intercept(
    operation: TRecordInterceptorType,
    records: Record[],
  ): Promise<Record[]> {
    records = await this.#registriesHandler.intercept(
      this,
      operation,
      records,
      this.#context,
      this.#disableIntercepts,
    );
    return records;
  }

  initializeQuery(): void {
    this.#query = this.#initializeQuery();
  }

  #initializeQuery(): Query {
    const query = new Query(this.#pool);
    // Select this table's own column list explicitly (rather than `*`) so
    // that, when this table has descendants, every UNION ALL branch selects
    // the same columns in the same order - each descendant physically
    // declares more columns than this table alone, so `*` would produce a
    // mismatched column count across branches.
    query.select(this.getColumnNames());
    this.#applyQueryTables(query);
    return query;
  }

  /**
   * Refreshes the query's FROM table list to this table plus its current
   * descendants, without disturbing any where/order/limit/offset state
   * already accumulated on the query. Descendant tables can be defined after
   * this `Table` instance (and its initial query) was constructed, so the
   * table list must be re-resolved right before each terminal read rather
   * than fixed once at construction time.
   */
  #refreshQueryTables(): void {
    this.#applyQueryTables(this.#query);
  }

  #applyQueryTables(query: Query): void {
    query.from(this.getName(), ...this.getDescendantTables());
  }

  #getQuery() {
    if (!this.#query) {
      throw ORMError.generalError("Query is not initialized");
    }
    return this.#query;
  }
}
