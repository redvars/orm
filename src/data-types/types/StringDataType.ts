import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";

export default class StringDataType extends IDataType {
  constructor() {
    super("string");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "VARCHAR";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  setValueIntercept(value: string | number | null): string | null {
    if (value === null) return null;
    return String(value);
  }

  getObjectIntercept(value: string | null): string | null {
    return value;
  }

  async validateValue() {}
}
