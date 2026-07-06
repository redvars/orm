export type TMigrationChangeType =
  | "CREATE_TABLE"
  | "ADD_COLUMN"
  | "DROP_COLUMN"
  | "RENAME_COLUMN"
  | "ALTER_COLUMN_TYPE"
  | "ADD_INDEX"
  | "ADD_UNIQUE";
