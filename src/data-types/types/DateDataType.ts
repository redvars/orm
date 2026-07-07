import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";

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
    value: Temporal.PlainDate | null,
  ): Temporal.PlainDate | null {
    if (typeof value === "string") {
      return Temporal.PlainDate.from(value);
    }
    if (value instanceof Date) {
      // Build the ISO string from local calendar fields, not toISOString()
      // (UTC) - the pg driver constructs this Date at local midnight for the
      // stored DATE value, so reading it back via UTC would shift the day in
      // any timezone ahead of UTC. (Deno's Temporal polyfill also rejects the
      // object-literal from({year, month, day}) form when a field is 0, so
      // a formatted string is used instead - not just a style preference.)
      const pad = (value: number) => String(value).padStart(2, "0");
      return Temporal.PlainDate.from(
        `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${
          pad(value.getDate())
        }`,
      );
    }
    return value;
  }

  async validateValue() {}
}
