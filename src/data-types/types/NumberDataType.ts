import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";

export default class NumberDataType extends IDataType {
  constructor() {
    super("number");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "DECIMAL";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  setValueIntercept(value: number | string | null): number | null {
    // pg returns NUMERIC/DECIMAL as a string to avoid floating-point
    // precision loss - same coercion is reused here for user-supplied
    // values too.
    if (value === null || typeof value === "undefined") return null;
    return typeof value === "string" ? Number(value) : value;
  }

  getObjectIntercept(value: number | null): number | null {
    return value;
  }

  async validateValue(value: any) {
    if (value !== null && typeof value !== "number") {
      throw new Error(`Invalid number value: ${value}`);
    }
  }
}
