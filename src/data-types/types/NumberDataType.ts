import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";
import { fromDatabaseValue } from "../nativeTypeUtils.ts";

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
    // Same string-to-number coercion pg needs for a NUMERIC/DECIMAL value
    // coming off the wire, so it's reused here for user-supplied values too.
    return fromDatabaseValue("DECIMAL", value) as number | null;
  }

  async validateValue(value: any) {
    if (value !== null && typeof value !== "number") {
      throw new Error(`Invalid number value: ${value}`);
    }
  }
}
