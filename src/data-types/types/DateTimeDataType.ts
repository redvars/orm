import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";

export default class DateTimeDataType extends IDataType {
  constructor() {
    super("datetime");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "TIMESTAMP";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  toJSONValue(value: Temporal.PlainDateTime | null): string | null {
    if (value instanceof Temporal.PlainDateTime) {
      return value.toString();
    }
    return value;
  }

  setValueIntercept(
    value: Temporal.PlainDateTime | string | null,
  ): Temporal.PlainDateTime | null {
    if (typeof value === "string") {
      return Temporal.PlainDateTime.from(value);
    }
    if (value instanceof Date) {
      // Build the ISO string from local calendar/time fields, not
      // toISOString() (UTC) - the pg driver constructs this Date to
      // represent local wall-clock time for the stored (timezone-less)
      // TIMESTAMP value, so reading it back via UTC would shift it by the
      // local UTC offset. (Deno's Temporal polyfill also rejects the
      // object-literal from({year, month, ...}) form when a field is 0, so a
      // formatted string is used instead - not just a style preference.)
      const pad = (value: number) => String(value).padStart(2, "0");
      return Temporal.PlainDateTime.from(
        `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${
          pad(value.getDate())
        }T${pad(value.getHours())}:${pad(value.getMinutes())}:${
          pad(value.getSeconds())
        }`,
      );
    }
    return value;
  }

  async validateValue() {}
}
