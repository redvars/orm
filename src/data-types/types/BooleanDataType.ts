import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";

export default class BooleanDataType extends IDataType {
  constructor() {
    super("boolean");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "BOOLEAN";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  setValueIntercept(
    value: boolean | number | string | null,
  ): boolean | string | number | null {
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
    if (typeof value === "number") {
      if (value === 0) return false;
      if (value === 1) return true;
    }
    return value;
  }

  getObjectIntercept(value: boolean | null): boolean | null {
    return value;
  }

  async validateValue() {}
}
