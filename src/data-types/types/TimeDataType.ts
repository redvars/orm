import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";
import { parsePlainTime } from "../nativeTypeUtils.ts";

export default class TimeDataType extends IDataType {
  constructor() {
    super("time");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "VARCHAR";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  /**
   * The pg driver returns TIME columns as a plain "HH:mm:ss" string, not a
   * native `Date` - the `Date` branch in `parsePlainTime` only exists for
   * callers that pass one directly (e.g. a custom native type mapping).
   */
  setValueIntercept(
    value: Temporal.PlainTime | Date | string | null,
  ): string | null {
    if (value === null || typeof value === "undefined") return null;
    return parsePlainTime(value).toString();
  }

  getObjectIntercept(value: string | null): Temporal.PlainTime | null {
    return value === null ? null : Temporal.PlainTime.from(value);
  }

  async validateValue() {}
}
