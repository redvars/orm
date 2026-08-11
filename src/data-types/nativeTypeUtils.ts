import type { TColumnDataType } from "../types.ts";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parsePlainDate(value: unknown): Temporal.PlainDate {
  if (value instanceof Date) {
    // Built from local calendar fields, not toISOString()'s UTC ones - the
    // pg driver constructs this Date at local midnight for a stored DATE
    // value, so reading it back via UTC would shift the day in any
    // timezone ahead of UTC. (Deno's Temporal polyfill also rejects the
    // object-literal from({year, month, day}) form when a field is 0, so a
    // formatted string is used instead - not just a style preference.)
    return Temporal.PlainDate.from(
      `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${
        pad(value.getDate())
      }`,
    );
  }
  return Temporal.PlainDate.from(value as string);
}

function parsePlainDateTime(value: unknown): Temporal.PlainDateTime {
  if (value instanceof Date) {
    // Same local-field reasoning as parsePlainDate - the pg driver
    // constructs this Date to represent local wall-clock time for the
    // stored (timezone-less) TIMESTAMP value.
    return Temporal.PlainDateTime.from(
      `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${
        pad(value.getDate())
      }T${pad(value.getHours())}:${pad(value.getMinutes())}:${
        pad(value.getSeconds())
      }`,
    );
  }
  return Temporal.PlainDateTime.from(value as string);
}

function parsePlainTime(value: unknown): Temporal.PlainTime {
  if (value instanceof Date) {
    return Temporal.PlainTime.from(
      `${pad(value.getHours())}:${pad(value.getMinutes())}:${
        pad(value.getSeconds())
      }`,
    );
  }
  return Temporal.PlainTime.from(value as string);
}

/**
 * Converts a raw value as returned by the Postgres driver (npm:pg) for a
 * given native column type into its canonical JS representation - keyed by
 * the native SQL type rather than by ORM-level data type name, since any
 * number of `IDataType`s (built-in or custom) can share the same native
 * type and therefore the same pg-driver value shape (e.g. every type backed
 * by `VARCHAR` needs no conversion at all).
 */
export const NATIVE_TYPE_CONVERTERS: Record<
  TColumnDataType,
  (value: unknown) => unknown
> = {
  VARCHAR: (value) => value,
  TEXT: (value) => value,
  CHAR: (value) => value,
  UUID: (value) => value,
  BOOLEAN: (value) => value,
  INTEGER: (value) => value,
  JSON: (value) => value,
  // pg returns NUMERIC/DECIMAL as a string to avoid floating-point
  // precision loss.
  DECIMAL: (value) => typeof value === "string" ? Number(value) : value,
  DATE: parsePlainDate,
  TIMESTAMP: parsePlainDateTime,
  // pg returns TIME as a plain "HH:mm:ss" string, not a native `Date` - the
  // `Date` branch in parsePlainTime only exists for callers that pass one
  // directly (e.g. a custom native type mapping).
  TIME: parsePlainTime,
};

/**
 * Looks up the converter for `nativeType` and applies it to `value` (`null`/
 * `undefined` always pass through as `null`), or passes `value` through
 * unchanged if `nativeType` isn't one of the built-in native types - e.g. a
 * custom `IDataType` mapped to a native SQL type this ORM doesn't otherwise
 * recognize, for which there's no reliable generic conversion.
 */
export function fromDatabaseValue(
  nativeType: string,
  value: unknown,
): unknown {
  if (value === null || typeof value === "undefined") return null;
  const converter = NATIVE_TYPE_CONVERTERS[nativeType as TColumnDataType];
  return converter ? converter(value) : value;
}
