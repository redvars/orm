import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";
import { parsePlainDate } from "../nativeTypeUtils.ts";

export default class DateDataType extends IDataType {
  constructor() {
    super("date");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "DATE";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  setValueIntercept(
    value: Temporal.PlainDate | string | Date | null,
  ): string | null {
    // Same string/Date parsing pg needs for a DATE value coming off the
    // wire, so it's reused here for user-supplied values too.
    if (value === null || typeof value === "undefined") return null;
    return parsePlainDate(value).toString();
  }

  getObjectIntercept(value: string | null): Temporal.PlainDate | null {
    return value === null ? null : Temporal.PlainDate.from(value);
  }

  async validateValue() {}
}
