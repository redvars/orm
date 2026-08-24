import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";

export default class IntegerDataType extends IDataType {
  constructor() {
    super("integer");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "INTEGER";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  setValueIntercept(value: number | string | null): number | null {
    if (value === null) return null;
    if (typeof value === "number") return value;
    if (typeof value === "string") return parseInt(value, 10);
    return value;
  }

  getObjectIntercept(value: number | null): number | null {
    return value;
  }

  async validateValue(value: any) {
    if (value !== null && typeof value !== "number") {
      throw new Error(`Invalid integer value: ${value}`);
    }
  }
}
