import ORMError from "../../../errors/ORMError.ts";
import type IClause from "./IClause.ts";

export default class GroupByClause implements IClause {
  #groupBy: string[] = [];

  constructor(
    columnNameOrObjectOrArray?: string | string[] | { [key: string]: boolean },
    ...otherColumns: string[]
  ) {
    if (
      typeof columnNameOrObjectOrArray === "undefined" ||
      columnNameOrObjectOrArray === null
    ) {
      throw ORMError.queryError(
        "The columns parameter provided for SelectQuery is incorrect. Please check and try again.",
      );
    }
    if (typeof columnNameOrObjectOrArray === "string") {
      if (otherColumns.length > 0) {
        this.#groupBy = [columnNameOrObjectOrArray, ...otherColumns];
      } else {
        this.#groupBy = [columnNameOrObjectOrArray];
      }
    } else if (Array.isArray(columnNameOrObjectOrArray)) {
      this.#groupBy = columnNameOrObjectOrArray;
    } else if (typeof columnNameOrObjectOrArray === "object") {
      this.#groupBy = Object.keys(columnNameOrObjectOrArray);
    }
    this.#groupBy.map((arg) => {
      if (typeof arg === "object") {
        throw ORMError.queryError(
          "The groupBy parameter provided for SelectQuery is incorrect. Please check and try again.",
        );
      }
      return arg;
    });
  }

  toJSON(): any {
    return {
      groupBy: this.#groupBy,
    };
  }

  prepareStatement(): { sql: string; values: any[] } {
    if (this.#groupBy.length === 0) {
      return {
        sql: "",
        values: [],
      };
    }
    return {
      sql: ` GROUP BY %I`,
      values: [this.#groupBy],
    };
  }
}
