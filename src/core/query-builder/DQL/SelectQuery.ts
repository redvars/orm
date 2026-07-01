import type IQuery from "../IQuery.ts";
import { pgFormat } from "../../../../deps.ts";
import WhereClause from "../CLAUSES/WhereClause.ts";
import type {
  TOrderBy,
  TOrderByDirection,
  TPreparedStatement,
  TWhereClauseOperator,
} from "../../types.ts";
import ORMError from "../../../errors/ORMError.ts";
import type IClause from "../CLAUSES/IClause.ts";
import LimitClause from "../CLAUSES/LimitClause.ts";
import OffsetClause from "../CLAUSES/OffsetClause.ts";
import GroupByClause from "../CLAUSES/GroupByClause.ts";
import OrderByClause from "../CLAUSES/OrderByClause.ts";
import ColumnsListClause from "../CLAUSES/ColumnsListClause.ts";
import { getFullFormTableName } from "../../../utils.ts";

export default class SelectQuery implements IQuery {
  #columnsClause?: ColumnsListClause;

  #tables?: string[];

  #whereClause: WhereClause = new WhereClause();

  #orderByClause?: OrderByClause;

  #offsetClause?: OffsetClause;

  #groupByClause?: GroupByClause;

  #limitClause?: LimitClause;

  constructor() {}

  /**
   * This method is used to set the columns for the select query.
   * @param {string | string[] | { [key: string]: boolean }} columnNameOrObjectOrArray - The column name or object or array.
   * @param {...string[]} otherColumns - The other columns.
   * @returns {SelectQuery} The SelectQuery instance.
   */
  columns(
    columnNameOrObjectOrArray?: string | string[] | { [key: string]: boolean },
    ...otherColumns: string[]
  ): SelectQuery {
    this.#columnsClause = new ColumnsListClause(
      columnNameOrObjectOrArray,
      ...otherColumns,
    );
    return this;
  }

  /**
   * This method is used to set the table or tables for the select query.
   * @param {string | string[]} tableOrTablesArray - The table or tables array.
   * @param {...string[]} otherTableNames - The other table names.
   * @returns {SelectQuery} The SelectQuery instance.
   */
  from(
    tableOrTablesArray: string | string[],
    ...otherTableNames: string[]
  ): SelectQuery {
    if (
      typeof tableOrTablesArray === "undefined" ||
      tableOrTablesArray === null
    ) {
      throw ORMError.queryError("Table name is required");
    }
    if (typeof tableOrTablesArray === "string") {
      if (tableOrTablesArray.length > 0) {
        this.#tables = [tableOrTablesArray, ...otherTableNames];
      } else {
        this.#tables = [tableOrTablesArray];
      }
    } else if (Array.isArray(tableOrTablesArray)) {
      this.#tables = tableOrTablesArray;
    }

    if (this.#tables) {
      for (const tableName of this.#tables) {
        if (typeof tableName !== "string" || tableName.length <= 0) {
          throw ORMError.queryError("Table name is required");
        }
      }
      this.#tables = this.#tables.map((tableName) => {
        return getFullFormTableName(tableName);
      });
    }

    return this;
  }

  /**
   * This method is used to set the where clause for the select query.
   *
   * @param {string | number | boolean | ((where: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {SelectQuery} The SelectQuery instance.
   */
  where(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): SelectQuery {
    this.#whereClause.where(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  /**
   * This method is used to set the AND where clause. (same as where)
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {SelectQuery} The SelectQuery instance.
   */
  andWhere(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): SelectQuery {
    return this.where(columnOrCompoundFunction, operatorOrValue, value);
  }

  /**
   * This method is used to set the or where clause for the select query.
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {SelectQuery} The SelectQuery instance.
   */
  orWhere(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): SelectQuery {
    this.#whereClause.orWhere(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  /**
   * This method is used to set the order by clause for the select query.
   * @param {string | TOrderBy[]} columnNameOrOrderList - The column name or order list.
   * @param {TOrderByDirection} direction - The direction.
   * @returns {SelectQuery} The SelectQuery instance.
   */
  orderBy(
    columnNameOrOrderList?: string | TOrderBy[],
    direction?: TOrderByDirection,
  ): SelectQuery {
    this.#orderByClause = new OrderByClause(columnNameOrOrderList, direction);
    return this;
  }

  /**
   * This method is used to set the group by clause for the select query.
   * @returns {SelectQuery} The SelectQuery instance.
   * @param columnNameOrObjectOrArray
   * @param otherColumns
   */
  groupBy(
    columnNameOrObjectOrArray?: string | string[] | { [key: string]: boolean },
    ...otherColumns: string[]
  ): SelectQuery {
    this.#groupByClause = new GroupByClause(
      columnNameOrObjectOrArray,
      ...otherColumns,
    );
    return this;
  }

  /**
   * This method is used to set the limit for the select query.
   * @param {number} limit - The limit.
   * @returns {SelectQuery} The SelectQuery instance.
   */
  limit(limit: number): SelectQuery {
    this.#limitClause = new LimitClause(limit);
    return this;
  }

  /**
   * This method is used to set the offset for the select query.
   * @param {number} offset - The offset.
   * @returns {SelectQuery} The SelectQuery instance.
   */
  offset(offset: number): SelectQuery {
    this.#offsetClause = new OffsetClause(offset);
    return this;
  }

  /**
   * Builds the SELECT query. When the query targets a single table, this is a
   * plain `SELECT ... FROM table ...` statement. When it targets more than one
   * table (a polymorphic read across a table-inheritance hierarchy), each
   * table is queried independently (same columns/WHERE) and the results are
   * combined with `UNION ALL`; ordering/limiting/grouping is applied once to
   * the combined result, since applying it per-branch would not produce
   * correct results across the union.
   */
  buildQuery(): string {
    if (!this.#tables) {
      throw ORMError.queryError(
        "The table name is required for the SELECT Query. Please check and try again.",
      );
    }

    const preparedStatement = this.#tables.length === 1
      ? this.#prepareSingleTableStatement(this.#tables[0])
      : this.#prepareUnionStatement(this.#tables);

    return pgFormat(preparedStatement.sql, ...preparedStatement.values);
  }

  #prepareSingleTableStatement(table: string): TPreparedStatement {
    const preparedStatement = this.#prepareSelectFromStatement(table);
    this.#applyClauses(preparedStatement, [
      this.#whereClause,
      this.#groupByClause,
      this.#orderByClause,
      this.#limitClause,
      this.#offsetClause,
    ]);
    return preparedStatement;
  }

  /**
   * Combines a `SELECT ... FROM table ...WHERE` statement per table with
   * `UNION ALL`, deferring rendering until the single, final `pgFormat` call
   * in `buildQuery()` - rendering each branch separately and splicing the
   * resulting SQL text back into an outer template would re-scan any `%`
   * characters that legitimately occur in already-escaped literal values
   * (e.g. a `LIKE` pattern) as format specifiers.
   */
  #prepareUnionStatement(tables: string[]): TPreparedStatement {
    const preparedStatement: TPreparedStatement = { sql: "", values: [] };

    preparedStatement.sql += "SELECT * FROM (";
    tables.forEach((table, index) => {
      if (index > 0) preparedStatement.sql += " UNION ALL ";
      const branchStatement = this.#prepareSelectFromStatement(table);
      this.#applyClauses(branchStatement, [this.#whereClause]);
      preparedStatement.sql += branchStatement.sql;
      preparedStatement.values.push(...branchStatement.values);
    });
    preparedStatement.sql += ") AS %I";
    preparedStatement.values.push("combined");

    this.#applyClauses(preparedStatement, [
      this.#groupByClause,
      this.#orderByClause,
      this.#limitClause,
      this.#offsetClause,
    ]);

    return preparedStatement;
  }

  #prepareSelectFromStatement(table: string): TPreparedStatement {
    const preparedStatement: TPreparedStatement = {
      sql: "",
      values: [],
    };

    preparedStatement.sql += "SELECT ";
    if (this.#columnsClause) {
      const columnsPreparedStatement = this.#columnsClause.prepareStatement();
      preparedStatement.sql += columnsPreparedStatement.sql;
      preparedStatement.values.push(...columnsPreparedStatement.values);
    }

    preparedStatement.sql += " FROM %s";
    preparedStatement.values.push(table);

    return preparedStatement;
  }

  #applyClauses(
    preparedStatement: TPreparedStatement,
    clauses: (IClause | undefined)[],
  ): void {
    for (const clause of clauses) {
      if (clause) {
        const compoundStatement = clause.prepareStatement();
        if (compoundStatement.sql) {
          preparedStatement.sql += compoundStatement.sql;
          preparedStatement.values.push(...compoundStatement.values);
        }
      }
    }
  }

  buildCountQuery(): string {
    return `SELECT COUNT(*) as count FROM (${this.buildQuery()}) as t`;
  }
}
