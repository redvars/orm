import type IClause from "./IClause.ts";

export default class OffsetClause implements IClause {
  #offset: number;

  constructor(offset: number) {
    if (isNaN(offset) || offset < 0) {
      throw new Error(
        `Invalid Offset provided in OffsetClause. Offset must be a number greater than 0.`,
      );
    }
    this.#offset = offset;
  }

  toJSON(): any {
    return {
      offset: this.#offset,
    };
  }

  prepareStatement(): { sql: string; values: any[] } {
    return {
      sql: ` OFFSET ${this.#offset}`,
      values: [],
    };
  }
}
