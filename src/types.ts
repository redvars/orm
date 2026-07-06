import type { JSONPrimitive, UUID4 } from "../deps.ts";

export type TForeignKey = {
  table: string;
  column: string;
  on_delete?: "NO ACTION" | "CASCADE" | "SET NULL" | "SET DEFAULT";
};

export type TColumnDefinition = {
  name: string;
  type: string;
  not_null?: boolean;
  default?: unknown;
  unique?: boolean;
  index?: boolean;
  foreign_key?: TForeignKey;
};

export type TColumnDefinitionStrict = {
  name: string;
  type: string;
  not_null: boolean;
  default: any;
  unique: boolean;
  index: boolean;
  foreign_key?: TForeignKey;
};

export type __TColumnDefinitionNative = {
  table: string;
  name: string;
  native_type?: string;
  not_null: boolean;
  unique: boolean;
  foreign_key?: TForeignKey;
};

export type TTableDefinition = {
  schema?: string;
  name: string;
  inherits?: string;
  final?: boolean;
  columns?: TColumnDefinition[];
  unique?: string[][];
  index?: string[][];
  /** Explicit column renames to apply before the add/drop diff, so a
   * rename isn't mistaken for a drop of the old name plus an add of the
   * new one. Keyed by the column's current physical name. */
  renames?: { [oldName: string]: string };
  /** Opt-in: allow `defineTable()` to DROP a physical column that's no
   * longer present in this definition. Defaults to false - columns removed
   * from a definition are otherwise left in place (and logged) rather than
   * silently dropped. */
  allowDestructiveMigrations?: boolean;
};

export type TTableDefinitionStrict = {
  schema: string;
  name: string;
  inherits?: string;
  final: boolean;
  columns: TColumnDefinitionStrict[];
  unique: string[][];
  index: string[][];
  renames: { [oldName: string]: string };
  allowDestructiveMigrations: boolean;
};

export type TColumnDataType =
  | "VARCHAR"
  | "UUID"
  | "CHAR"
  | "TEXT"
  | "DECIMAL"
  | "INTEGER"
  | "BOOLEAN"
  | "DATE"
  | "JSON"
  | "TIME"
  | "TIMESTAMP";

export type TRecord = {
  id?: UUID4;
  _table?: string;
  [key: string]: unknown;
};

export type TRecordInterceptorType =
  | "BEFORE_INSERT"
  | "AFTER_INSERT"
  | "BEFORE_UPDATE"
  | "AFTER_UPDATE"
  | "BEFORE_DELETE"
  | "AFTER_DELETE"
  | "BEFORE_SELECT"
  | "AFTER_SELECT";

export type TRecordInterceptorContext = any;

export type SimpleCondition = {
  column: string | number;
  operator: string;
  value: JSONPrimitive | JSONPrimitive[];
};
