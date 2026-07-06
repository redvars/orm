import type { TColumnDataType } from "../types.ts";

/**
 * Maps a built-in `TColumnDataType` (the native DDL type used in `CREATE
 * TABLE`/`ALTER TABLE`) to the value Postgres reports back in
 * `information_schema.columns.data_type` for that same column, so a
 * declared type can be compared against what's physically there. Custom
 * types registered via `ORM.addDataType()` aren't covered here - there's no
 * reliable way to map an arbitrary custom native type string back to an
 * `information_schema` type name, so type-change detection is skipped for
 * columns using a custom type.
 */
export const NATIVE_TYPE_TO_INFORMATION_SCHEMA_TYPE: Record<
  TColumnDataType,
  string
> = {
  VARCHAR: "character varying",
  UUID: "uuid",
  CHAR: "character",
  TEXT: "text",
  DECIMAL: "numeric",
  INTEGER: "integer",
  BOOLEAN: "boolean",
  DATE: "date",
  JSON: "json",
  TIME: "time without time zone",
  TIMESTAMP: "timestamp without time zone",
};
