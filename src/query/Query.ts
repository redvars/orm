import SelectQuery from "../core/query-builder/DQL/SelectQuery.ts";
import CreateQuery from "../core/query-builder/DDL/CreateQuery.ts";
import InsertQuery from "./../core/query-builder/DML/InsertQuery.ts";

import AlterQuery from "../core/query-builder/DDL/AlterQuery.ts";
import type { TOrderBy, TOrderByDirection } from "../core/types.ts";
import type { TWhereClauseOperator } from "../core/types.ts";
import { runSQLQuery } from "../utils.ts";
import ORMError from "../errors/ORMError.ts";
import type { __TColumnDefinitionNative } from "../types.ts";
import type IConnectable from "../core/connection/IConnectable.ts";
import type WhereClause from "../core/query-builder/CLAUSES/WhereClause.ts";
import UpdateQuery from "../core/query-builder/DML/UpdateQuery.ts";
import DeleteQuery from "../core/query-builder/DML/DeleteQuery.ts";
import { DatabaseClient } from "../core/connection/DatabaseClient.ts";

type QueryType =
  | SelectQuery
  | DeleteQuery
  | CreateQuery
  | InsertQuery
  | UpdateQuery
  | AlterQuery;

export default class Query {
  readonly #connection: IConnectable;

  #query?: QueryType;

  constructor(connection: IConnectable) {
    this.#connection = connection;
  }

  getInstance(): Query {
    return new Query(this.#connection);
  }

  getSelectQuery(): SelectQuery {
    return <SelectQuery> this.#query;
  }

  setQuery(query: QueryType) {
    this.#query = query;
  }

  getType(): string | undefined {
    if (this.#query instanceof SelectQuery) return "select";
    if (this.#query instanceof DeleteQuery) return "delete";
    if (this.#query instanceof CreateQuery) return "create";
    if (this.#query instanceof InsertQuery) return "insert";
    if (this.#query instanceof UpdateQuery) return "update";
    if (this.#query instanceof AlterQuery) return "alter";
  }

  /* Create query */
  create(nameWithSchema: string): Query {
    this.#query = new CreateQuery(nameWithSchema);
    return this;
  }

  alter(nameWithSchema: string): Query {
    this.#query = new AlterQuery(nameWithSchema);
    return this;
  }

  addColumn(column: __TColumnDefinitionNative): Query {
    const query = <CreateQuery> this.#getQuery();
    query.addColumn(column);
    return this;
  }

  addUnique(columns: string[]): Query {
    const query = <CreateQuery> this.#getQuery();
    query.addUnique(columns);
    return this;
  }

  /* Insert query */
  insert(): Query {
    this.#query = new InsertQuery();
    return this;
  }

  into(nameWithSchema: string): Query {
    const query = <InsertQuery> this.#getQuery();
    query.into(nameWithSchema);
    return this;
  }

  columns(...args: any[]): Query {
    const query = <InsertQuery> this.#getQuery();
    query.columns(...args);
    return this;
  }

  values(rows: any[]): Query {
    const query = <InsertQuery> this.#getQuery();
    query.values(rows);
    return this;
  }

  returning(...args: any[]): Query {
    const query = <InsertQuery> this.#getQuery();
    query.returning(...args);
    return this;
  }

  /* Update query */
  update(): Query {
    this.#query = new UpdateQuery();
    return this;
  }

  set(columnOrRecord: string | { [key: string]: any }, value?: any): Query {
    const query = <UpdateQuery> this.#getQuery();
    query.set(columnOrRecord, value);
    return this;
  }

  /**
   * This method is used to set the columns for the select query.
   * @param {string | string[] | { [key: string]: boolean }} columnNameOrObjectOrArray - The column name or object or array.
   * @param {...string[]} otherColumns - The other columns.
   * @returns {SelectQuery} The SelectQuery instance.
   */
  select(
    columnNameOrObjectOrArray?: string | string[] | { [key: string]: boolean },
    ...otherColumns: string[]
  ): Query {
    this.#query = new SelectQuery();
    this.#query.columns(columnNameOrObjectOrArray, ...otherColumns);
    return this;
  }

  delete(): Query {
    this.#query = new DeleteQuery();
    return this;
  }

  from(name: string, ...otherNames: string[]): Query {
    if (!this.#query) {
      throw new ORMError("QUERY", "Query not initialized");
    }
    if (!name) {
      throw new ORMError("QUERY", "Table name not provided");
    }

    const query = <SelectQuery | DeleteQuery> this.#query;
    query.from(name, ...otherNames);
    return this;
  }

  groupBy(columnName: string): Query {
    const query = <SelectQuery> this.#getQuery();
    query.groupBy(columnName);
    return this;
  }

  /**
   * This method is used to set the where clause for the query.
   * @param {string | number | boolean | ((where: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {Query} The Query instance.
   */
  where(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): Query {
    const query = <SelectQuery> this.#getQuery();
    query.where(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  /**
   * This method is used to set the AND where clause. (same as where)
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {Query} The Query instance.
   */
  andWhere(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): Query {
    const query = <SelectQuery> this.#getQuery();
    query.andWhere(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  /**
   * This method is used to set the or where clause for the query.
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
  ): Query {
    const query = <SelectQuery> this.#getQuery();
    query.orWhere(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  limit(limit: number): Query {
    const query = <SelectQuery> this.#getQuery();
    query.limit(limit);
    return this;
  }

  offset(offset: number): Query {
    const query = <SelectQuery> this.#getQuery();
    query.offset(offset);
    return this;
  }

  orderBy(
    columnNameOrOrderList?: string | TOrderBy[],
    direction?: TOrderByDirection,
  ): Query {
    const query = <SelectQuery> this.#getQuery();
    query.orderBy(columnNameOrOrderList, direction);
    return this;
  }

  getSQLQuery(): string {
    const query = this.#getQuery();
    return query.buildQuery();
  }

  getCountSQLQuery(): string {
    const query = <SelectQuery> this.#getQuery();
    return query.buildCountQuery();
  }

  async execute(sqlString?: string): Promise<any> {
    const sqlQuery = sqlString || this.getSQLQuery();
    const reserve = await this.#connection.connect();
    let result;
    try {
      result = await runSQLQuery(reserve, sqlQuery);
    } catch (_err) {
      reserve.release();
      throw _err;
    }
    reserve.release();
    return result;
  }

  async cursor(): Promise<{ cursor: any; reserve: DatabaseClient }> {
    if (this.getType() !== "select") {
      throw new ORMError("QUERY", "Query type not supported");
    }
    const sqlQuery = this.getSQLQuery();
    const reserve = await this.#connection.connect();
    const cursor = await reserve.createCursor(sqlQuery);
    return { cursor, reserve };
  }

  #getQuery():
    | SelectQuery
    | DeleteQuery
    | CreateQuery
    | InsertQuery
    | UpdateQuery
    | AlterQuery {
    if (!this.#query) {
      throw new ORMError("QUERY", "Query not initialized");
    }
    return this.#query;
  }
}
