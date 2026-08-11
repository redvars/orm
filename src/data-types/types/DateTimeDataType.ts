import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";
import { fromDatabaseValue } from "../nativeTypeUtils.ts";

export default class DateTimeDataType extends IDataType {
  constructor() {
    super("datetime");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "TIMESTAMP";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  /**
   * Postgres TIMESTAMP has no timezone, so there's no real UTC instant to
   * recover here - the wall-clock value is treated as if it were UTC to
   * produce a stable, directly comparable ISO instant for JSON interchange.
   */
  toJSONValue(value: Temporal.PlainDateTime | null): string | null {
    if (value instanceof Temporal.PlainDateTime) {
      return value.toZonedDateTime("UTC").toInstant().toString();
    }
    return value;
  }

  setValueIntercept(
    value: Temporal.PlainDateTime | string | Date | null,
  ): Temporal.PlainDateTime | null {
    // Same string/Date parsing pg needs for a TIMESTAMP value coming off
    // the wire, so it's reused here for user-supplied values too.
    return fromDatabaseValue("TIMESTAMP", value) as
      | Temporal.PlainDateTime
      | null;
  }

  async validateValue() {}
}
