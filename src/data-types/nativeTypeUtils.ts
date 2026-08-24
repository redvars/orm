function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function parsePlainDate(value: unknown): Temporal.PlainDate {
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

export function parsePlainDateTime(value: unknown): Temporal.PlainDateTime {
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

export function parsePlainTime(value: unknown): Temporal.PlainTime {
  if (value instanceof Date) {
    // Same local-field reasoning as parsePlainDate, to avoid shifting by
    // the local UTC offset. (Deno's Temporal polyfill also rejects the
    // object-literal from({hour, ...}) form when a field is 0, so a
    // formatted string is used instead - not just a style preference.)
    return Temporal.PlainTime.from(
      `${pad(value.getHours())}:${pad(value.getMinutes())}:${
        pad(value.getSeconds())
      }`,
    );
  }
  return Temporal.PlainTime.from(value as string);
}
