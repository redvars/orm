import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";
import { fromDatabaseValue } from "../nativeTypeUtils.ts";

export default class DateDataType extends IDataType {
  constructor() {
    super("date");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "DATE";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  toJSONValue(value: Temporal.PlainDate | null): string | null {
    if (value instanceof Temporal.PlainDate) {
      return value.toString();
    }
    return value;
  }

  setValueIntercept(
    value: Temporal.PlainDate | string | Date | null,
  ): Temporal.PlainDate | null {
    // Same string/Date parsing pg needs for a DATE value coming off the
    // wire, so it's reused here for user-supplied values too.
    return fromDatabaseValue("DATE", value) as Temporal.PlainDate | null;
  }

  async validateValue() {}
}
