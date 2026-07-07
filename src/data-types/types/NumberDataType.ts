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

  toJSONValue(value: number | null): number | null {
    return value;
  }

  setValueIntercept(value: number | string | null): number | null {
    //@ts-ignore
    if (typeof value === "string") return value * 1;
    return value;
  }

  async validateValue(value: any) {
    if (value !== null && typeof value !== "number") {
      throw new Error(`Invalid number value: ${value}`);
    }
  }
}
