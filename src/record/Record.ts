import { type Logger, type UUID4 } from "../../deps.ts";
import type { TRecord } from "../types.ts";
import type Table from "../table/Table.ts";
import type ColumnDefinitionHandler from "../table/ColumnDefinitionHandler.ts";
import { RecordSaveError } from "../errors/RecordSaveError.ts";
import type Query from "../query/Query.ts";
import { FieldValidationError } from "../errors/FieldValidationError.ts";
import { generateUUID, logSQLQuery } from "../utils.ts";
import ORMError from "../errors/ORMError.ts";

export default class Record {
  #isNew = false;

  readonly #logger: Logger;

  #record?: TRecord;

  readonly #queryBuilder: Query;

  readonly #table: Table;

  #columnsModified: { [key: string]: boolean } = {};

  #related: { [columnName: string]: Record | undefined } = {};

  constructor(
    queryBuilder: Query,
    table: Table,
    logger: Logger,
    record?: TRecord,
  ) {
    this.#queryBuilder = queryBuilder;
    this.#logger = logger;
    this.#table = table;
    if (typeof record === "undefined") {
      this.#initialize();
    } else {
      this.#record = {};
      for (const key of Object.keys(record)) this.#hydrate(key, record[key]);
    }
  }

  isNew(): boolean {
    return this.#isNew;
  }

  getTable(): Table {
    return this.#table;
  }

  getID(): string {
    return this.get("id");
  }

  /**
   * Sets the eagerly-loaded related record for a foreign-key column. Called
   * by `Table` after `.with(columnName)` triggers a batched lookup - not
   * intended to be called directly.
   */
  setRelated(columnName: string, record: Record | undefined): void {
    this.#related[columnName] = record;
  }

  /**
   * Returns the related record previously loaded via `.with(columnName)` on
   * the table this record was fetched from, or `undefined` if `.with()`
   * wasn't used for this column (or no matching related row was found).
   */
  getRelated(columnName: string): Record | undefined {
    return this.#related[columnName];
  }

  set(key: string, value: any): void {
    const record = this.#getRawRecord();
    const field = this.#table.getColumnSchema(key);
    if (field) {
      if (typeof value === "undefined") {
        record[key] = null;
      } else {
        record[key] = field.getColumnType().setValueIntercept(value);
      }
      this.#columnsModified[key] = true;
    }
  }

  /**
   * Returns the column's JSON-safe representation (e.g. an ISO string for
   * date/time types) - this is what's stored on the record internally, so
   * no conversion happens here. Use `getObject()` for the canonical JS
   * representation (e.g. `Temporal.PlainDate`).
   */
  get(key: string): any {
    const record = this.#getRawRecord();
    if (this.#table.getColumnSchema(key)) return record[key];
    return null;
  }

  /**
   * Returns the column's canonical JS representation (e.g.
   * `Temporal.PlainDate`), converted on demand from the stored JSON-safe
   * value via the column's `IDataType#getObjectIntercept`.
   */
  getObject(key: string): any {
    const record = this.#getRawRecord();
    const dataType = this.#table.getColumnSchema(key)?.getColumnType();
    if (dataType && typeof record[key] !== "undefined") {
      return dataType.getObjectIntercept(record[key]);
    }
    return null;
  }

  getDisplayValue(key: string): string {
    const record = this.#getRawRecord();
    const dataType = this.#table.getColumnSchema(key)?.getColumnType();
    if (dataType && typeof record[key] !== "undefined") {
      return dataType.getDisplayValue(record[key]);
    }
    return "";
  }

  /**
   * Populates a column from a raw value as returned by the pg driver (e.g. a
   * native `Date` for a DATE/TIMESTAMP column). Reuses `setValueIntercept`
   * (the same conversion `set()` uses for user-supplied values) since its
   * implementations must already accept the driver's raw shapes.
   */
  #hydrate(key: string, value: any): void {
    const record = this.#getRawRecord();
    const field = this.#table.getColumnSchema(key);
    if (field) {
      record[key] = typeof value === "undefined"
        ? null
        : field.getColumnType().setValueIntercept(value);
      this.#columnsModified[key] = true;
    }
  }

  async insert(): Promise<Record> {
    let [record] = await this.#table.intercept("BEFORE_INSERT", [this]);

    const recordJson = record.toJSON();
    await this.#validateRecord(recordJson);
    this.#queryBuilder.insert();
    this.#queryBuilder.into(this.#table.getName());
    this.#queryBuilder.columns(this.#table.getColumnNames());
    this.#queryBuilder.values([recordJson]);
    this.#queryBuilder.returning("*");

    logSQLQuery(this.#logger, this.#queryBuilder.getSQLQuery());

    let savedRawRecord: TRecord;
    try {
      [savedRawRecord] = await this.#queryBuilder.execute();
    } catch (err: any) {
      this.#logger.error(err);
      throw new RecordSaveError(
        this.#table.getDefinitionClone(),
        record.getID(),
        [],
        err.message,
      );
    }

    [record] = await this.#table.intercept("AFTER_INSERT", [
      new Record(this.#queryBuilder, this.#table, this.#logger, savedRawRecord),
    ]);
    this.#record = record.toJSON();
    this.#isNew = false;
    this.#columnsModified = {};
    return this;
  }

  async update(): Promise<Record> {
    let [record] = await this.#table.intercept("BEFORE_UPDATE", [this]);

    const recordJson = record.toJSON();
    await this.#validateRecord(recordJson);
    this.#queryBuilder.update();
    this.#queryBuilder.into(record.get("_table"));
    this.#queryBuilder.where("id", record.getID());
    Object.keys(this.#columnsModified).forEach((col) => {
      if (col !== "id") {
        this.#queryBuilder.set(col, recordJson[col]);
      }
    });
    this.#queryBuilder.returning("*");

    logSQLQuery(this.#logger, this.#queryBuilder.getSQLQuery());

    let savedRawRecord: TRecord;
    try {
      [savedRawRecord] = await this.#queryBuilder.execute();
    } catch (err: any) {
      this.#logger.error(err);
      throw new RecordSaveError(
        this.#table.getDefinitionClone(),
        record.getID(),
        [],
        err.message,
      );
    }

    [record] = await this.#table.intercept("AFTER_UPDATE", [
      new Record(this.#queryBuilder, this.#table, this.#logger, savedRawRecord),
    ]);
    this.#record = record.toJSON();
    this.#columnsModified = {};
    return this;
  }

  async delete(): Promise<Record> {
    if (this.#isNew) {
      throw ORMError.generalError("Cannot remove unsaved record");
    }
    const [record] = await this.#table.intercept("BEFORE_DELETE", [this]);

    this.#queryBuilder.delete();
    this.#queryBuilder.from(record.get("_table"));
    this.#queryBuilder.where("id", record.getID());

    logSQLQuery(this.#logger, this.#queryBuilder.getSQLQuery());

    try {
      await this.#queryBuilder.execute();
    } catch (err: any) {
      this.#logger.error(err);
      throw new RecordSaveError(
        this.#table.getDefinitionClone(),
        record.getID(),
        [],
        err.message,
      );
    }

    await this.#table.intercept("AFTER_DELETE", [record]);
    return this;
  }

  toJSON(columns?: string[]): TRecord {
    const rawRecord: TRecord = {};
    this.#table
      .getColumns()
      .filter((field: ColumnDefinitionHandler) => {
        return !columns || columns.includes(field.getName());
      })
      .forEach((columnSchema: ColumnDefinitionHandler) => {
        rawRecord[columnSchema.getName()] = this.get(columnSchema.getName());
      });
    return rawRecord;
  }

  toString(): string {
    return JSON.stringify(this.toJSON());
  }

  #initialize() {
    this.#record = {};
    this.#columnsModified = {};
    this.#table.getColumns().map((field: ColumnDefinitionHandler) => {
      this.set(field.getName(), field.getDefaultValue());
    });
    this.#record["id"] = <UUID4> generateUUID();
    this.#record["_table"] = this.#table.getName();
    this.#isNew = true;
  }

  #getRawRecord(): TRecord {
    if (typeof this.#record === "undefined") {
      throw ORMError.generalError("Record not initialized");
    }
    return this.#record;
  }

  async #validateRecord(rawRecord: TRecord) {
    const fieldErrors: FieldValidationError[] = [];
    for (const columnSchema of this.#table.getColumns()) {
      const value = rawRecord[columnSchema.getName()];
      try {
        await columnSchema.getColumnType().validateValue(value);
      } catch (err: any) {
        fieldErrors.push(
          new FieldValidationError(
            columnSchema.getDefinitionClone(),
            value,
            err.message,
          ),
        );
      }
    }
    if (fieldErrors.length) {
      throw new RecordSaveError(
        this.#table.getDefinitionClone(),
        rawRecord.id,
        fieldErrors,
      );
    }
  }
}
