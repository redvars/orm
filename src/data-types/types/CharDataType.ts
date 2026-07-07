import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";

export default class CharDataType extends IDataType {
  constructor() {
    super("char");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "CHAR";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  toJSONValue(value: string | null): string | null {
    return value;
  }

  setValueIntercept(value: string | number | null): string | null {
    if (value === null) return null;
    return String(value);
  }

  async validateValue() {}
}
