import type { TLogicalOperator, TPreparedStatement } from "../../types.ts";
import type SimpleExpression from "./SimpleExpression.ts";

export default class CompoundExpression {
  firstExpression?: SimpleExpression | CompoundExpression;
  remainingExpressions: {
    operator: TLogicalOperator;
    expression: SimpleExpression | CompoundExpression;
  }[] = [];
  constructor() {}

  addExpression(
    expression: SimpleExpression | CompoundExpression,
    operator: TLogicalOperator,
  ) {
    if (typeof this.firstExpression === "undefined") {
      this.firstExpression = expression;
    } else {
      this.remainingExpressions.push({
        operator: operator,
        expression,
      });
    }
  }

  toJSON(): any {
    return {
      firstExpression: this.firstExpression?.toJSON(),
      remainingExpressions: this.remainingExpressions.map((exp) => ({
        operator: exp.operator,
        expression: exp.expression.toJSON(),
      })),
    };
  }

  prepareStatement(): TPreparedStatement {
    let sql = "";
    let values: any[] = [];
    if (this.firstExpression) {
      const firstExp = this.firstExpression.prepareStatement();
      sql += firstExp.sql;
      values = values.concat(firstExp.values);

      /**
       * Merge all remaining expressions to the main statement
       * by joining them with the logical operator
       * Eg: `id > 1 AND id < 10`
       */
      for (const exp of this.remainingExpressions) {
        const { operator, expression } = exp;
        const expStatement = expression.prepareStatement();
        sql += ` ${operator} ${expStatement.sql}`;
        values = values.concat(expStatement.values);
      }

      /**
       * If there are more than one expression, wrap them in parentheses
       */
      if (this.remainingExpressions.length > 0) {
        sql = `(${sql})`;
      }
    }

    return {
      sql,
      values,
    };
  }
}
