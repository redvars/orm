import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";

export default class TimeDataType extends IDataType {
  constructor() {
    super("time");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "VARCHAR";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  toJSONValue(value: Temporal.PlainTime | null): string | null {
    if (value instanceof Temporal.PlainTime) {
      return value.toString();
    }
    return value;
  }

  /**
   * The pg driver returns TIME columns as a plain "HH:mm:ss" string, not a
   * native `Date` - the `Date` branch below only exists for callers that
   * pass one directly (e.g. through `setValueIntercept`, or a custom native
   * type mapping).
   */
  fromDatabaseValue(value: string | Date | null): Temporal.PlainTime | null {
    return this.#normalize(value);
  }

  setValueIntercept(
    value: Temporal.PlainTime | Date | string | null,
  ): Temporal.PlainTime | null {
    return this.#normalize(value);
  }

  #normalize(
    value: Temporal.PlainTime | Date | string | null,
  ): Temporal.PlainTime | null {
    if (typeof value === "string") {
      return Temporal.PlainTime.from(value);
    }
    if (value instanceof Date) {
      // Build the string from local time fields, not UTC ones - consistent
      // with DateDataType/DateTimeDataType, to avoid shifting by the local
      // UTC offset. (Deno's Temporal polyfill also rejects the
      // object-literal from({hour, ...}) form when a field is 0, so a
      // formatted string is used instead - not just a style preference.)
      const pad = (value: number) => String(value).padStart(2, "0");
      return Temporal.PlainTime.from(
        `${pad(value.getHours())}:${pad(value.getMinutes())}:${
          pad(value.getSeconds())
        }`,
      );
    }
    return value;
  }

  async validateValue() {}
}
