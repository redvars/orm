import type IQuery from "../IQuery.ts";
import ORMError from "../../../errors/ORMError.ts";
import type { TPreparedStatement, TWhereClauseOperator } from "../../types.ts";
import WhereClause from "../CLAUSES/WhereClause.ts";
import { pgFormat } from "../../../../deps.ts";
import { getFullFormTableName } from "../../../utils.ts";

export default class DeleteQuery implements IQuery {
  #fromTable?: string;

  #whereClause: WhereClause = new WhereClause();

  constructor() {}

  from(tableName: string, ..._otherNames: string[]): DeleteQuery {
    this.#fromTable = getFullFormTableName(tableName);
    return this;
  }

  /**
   * This method is used to set the AND where clause for the delete query.
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {DeleteQuery} The DeleteQuery instance.
   */
  where(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): DeleteQuery {
    this.#whereClause.where(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  /**
   * This method is used to set the AND where clause for the delete query. (same as where)
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {DeleteQuery} The DeleteQuery instance.
   */
  andWhere(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): DeleteQuery {
    return this.where(columnOrCompoundFunction, operatorOrValue, value);
  }

  /**
   * This method is used to set the or where clause for the delete query.
   *
   * @param columnOrCompoundFunction
   * @param operatorOrValue
   * @param value
   * @returns {DeleteQuery} The DeleteQuery instance.
   */
  orWhere(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((where: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): DeleteQuery {
    this.#whereClause.orWhere(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  buildQuery(): string {
    const preparedStatement: TPreparedStatement = {
      sql: "",
      values: [],
    };

    if (!this.#fromTable) {
      throw ORMError.queryError(
        "The table name is required for the DELETE Query. Please check and try again.",
      );
    }

    /**
     * DELETE FROM table_name
     */
    preparedStatement.sql += `DELETE FROM %s`;
    preparedStatement.values.push(this.#fromTable);

    /**
     * WHERE condition
     */
    const whereStatement = this.#whereClause.prepareStatement();
    if (whereStatement.sql) {
      preparedStatement.sql += whereStatement.sql;
      preparedStatement.values.push(...whereStatement.values);
    }

    return pgFormat(preparedStatement.sql, ...preparedStatement.values);
  }
}
