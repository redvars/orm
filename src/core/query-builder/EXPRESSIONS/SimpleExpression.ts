import {
  type TPreparedStatement,
  type TWhereClauseOperator,
  WHERE_CLAUSE_OPERATORS,
  WHERE_CLAUSE_OPERATORS_ARRAY_VALUES,
  WHERE_CLAUSE_OPERATORS_NO_VALUES,
} from "../../types.ts";
import ORMError from "../../../errors/ORMError.ts";

export default class SimpleExpression {
  //@ts-ignore
  #column: string | number | boolean;

  #operator?: TWhereClauseOperator;

  #value: any;

  constructor(
    column: string | number | boolean,
    operator: TWhereClauseOperator | any,
    value?: any,
  ) {
    this.#initialize(column, operator, value);
  }

  toJSON(): any {
    return {
      column: this.#column,
      operator: this.#operator,
      value: this.#value,
    };
  }

  prepareStatement(): TPreparedStatement {
    if (!this.#column || !this.#operator) {
      throw ORMError.queryError(
        `Invalid SimpleExpression provided in SelectQuery.  Column and operator are required.`,
      );
    }
    if (WHERE_CLAUSE_OPERATORS_NO_VALUES.includes(this.#operator)) {
      return {
        sql: `%I ${this.#operator}`,
        values: [this.#column],
      };
    }
    if (WHERE_CLAUSE_OPERATORS_ARRAY_VALUES.includes(this.#operator)) {
      return {
        sql: `%I ${this.#operator} (%L)`,
        values: [this.#column, this.#value],
      };
    }
    if (typeof this.#column === "number" || typeof this.#column === "boolean") {
      return {
        sql: `%L ${this.#operator} %L`,
        values: [this.#column, this.#value],
      };
    }
    return {
      sql: `%I ${this.#operator} %L`,
      values: [this.#column, this.#value],
    };
  }

  #populate(
    column: string | number | boolean,
    operator: TWhereClauseOperator,
    value: any,
  ) {
    const operatorStrict = <TWhereClauseOperator> operator.toUpperCase();

    if (operator === "=" && value === null) {
      this.#populate(column, "IS NULL", null);
      return;
    }
    if ((operator === "!=" || operator === "<>") && value === null) {
      this.#populate(column, "IS NOT NULL", null);
      return;
    }

    if (WHERE_CLAUSE_OPERATORS.includes(operatorStrict) === false) {
      throw ORMError.queryError(
        `Invalid operator provided in SelectQuery.  "${operator}" is not a valid operator.`,
      );
    }

    if (
      WHERE_CLAUSE_OPERATORS_ARRAY_VALUES.includes(operatorStrict) &&
      !Array.isArray(value)
    ) {
      throw new Error(
        `Invalid value for ${operatorStrict} operator. Expected an array.`,
      );
    }

    this.#column = column;
    this.#operator = operatorStrict;
    this.#value = value;
  }

  #initialize(
    column: string | number | boolean,
    operator: TWhereClauseOperator | any,
    value?: any,
  ) {
    // Support "where true || where false"
    if (column === false || column === true) {
      this.#populate(1, "=", column ? 1 : 0);
      return;
    }
    if (typeof value === "undefined") {
      if (Array.isArray(operator)) {
        this.#initialize(column, "IN", operator);
        return;
      }
      if (
        typeof operator == "string" &&
        WHERE_CLAUSE_OPERATORS.includes(
          <TWhereClauseOperator> operator.toUpperCase(),
        )
      ) {
        this.#initialize(column, operator, null);
        return;
      }
      this.#initialize(column, "=", operator);
      return;
    }

    this.#populate(column, operator, value);
  }
}
