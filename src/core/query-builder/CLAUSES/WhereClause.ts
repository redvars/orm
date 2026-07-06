import CompoundExpression from "../EXPRESSIONS/CompoundExpression.ts";
import SimpleExpression from "../EXPRESSIONS/SimpleExpression.ts";
import type {
  TLogicalOperator,
  TPreparedStatement,
  TWhereClauseOperator,
} from "../../types.ts";
import type IClause from "./IClause.ts";

export default class WhereClause implements IClause {
  #expression?: CompoundExpression;

  constructor() {}

  getCompoundExpression(): CompoundExpression | undefined {
    return this.#expression;
  }

  /**
   * This method is used to set the AND where clause.
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {WhereClause} The WhereClause instance.
   */
  where(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((subClause: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): WhereClause {
    this.#where("AND", columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  /**
   * This method is used to set the AND where clause. (same as where)
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {WhereClause} The WhereClause instance.
   */
  andWhere(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((subClause: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ): WhereClause {
    this.where(columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  /**
   * This method is used to set the OR where clause.
   *
   * @param {string | number | boolean | ((subClause: WhereClause) => void)} columnOrCompoundFunction - The column or compound function.
   * @param {TWhereClauseOperator | any} operatorOrValue - The operator or value.
   * @param {any} value - The value.
   * @returns {WhereClause} The WhereClause instance.
   */
  orWhere(
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((subClause: WhereClause) => void),
    operatorOrValue?: any,
    value?: any,
  ): WhereClause {
    this.#where("OR", columnOrCompoundFunction, operatorOrValue, value);
    return this;
  }

  toJSON(): any {
    return this.#expression?.toJSON();
  }

  prepareStatement(): TPreparedStatement {
    if (!this.#expression) {
      return {
        sql: "",
        values: [],
      };
    }
    const { sql, values } = this.#expression.prepareStatement();
    return {
      sql: ` WHERE ${sql}`,
      values: values,
    };
  }

  #where(
    logicalOperator: TLogicalOperator,
    columnOrCompoundFunction:
      | string
      | number
      | boolean
      | ((subClause: WhereClause) => void),
    operatorOrValue?: TWhereClauseOperator | any,
    value?: any,
  ) {
    if (!this.#expression) this.#expression = new CompoundExpression();

    if (typeof columnOrCompoundFunction === "function") {
      const where = new WhereClause();
      columnOrCompoundFunction(where);
      const compoundExpression = where.getCompoundExpression();
      if (compoundExpression) {
        this.#expression.addExpression(compoundExpression, logicalOperator);
      } else {
        console.log("Ignoring empty expression");
      }
    } else {
      this.#expression.addExpression(
        new SimpleExpression(columnOrCompoundFunction, operatorOrValue, value),
        logicalOperator,
      );
    }
  }
}
