import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";
import { parsePlainDateTime } from "../nativeTypeUtils.ts";

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
  setValueIntercept(
    value: Temporal.PlainDateTime | string | Date | null,
  ): string | null {
    // Same string/Date parsing pg needs for a TIMESTAMP value coming off
    // the wire, so it's reused here for user-supplied values too.
    if (value === null || typeof value === "undefined") return null;
    return parsePlainDateTime(value).toZonedDateTime("UTC").toInstant()
      .toString();
  }

  /**
   * Reverses `setValueIntercept`'s wall-clock-as-UTC treatment: the stored
   * ISO instant is read back as a UTC zoned time and its wall-clock fields
   * become the `Temporal.PlainDateTime`.
   */
  getObjectIntercept(value: string | null): Temporal.PlainDateTime | null {
    if (value === null) return null;
    return Temporal.Instant.from(value).toZonedDateTimeISO("UTC")
      .toPlainDateTime();
  }

  async validateValue() {}
}
