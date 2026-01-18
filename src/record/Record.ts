import {
  CommonUtils,
  type JSONValue,
  type Logger,
  type UUID4,
} from "../../deps.ts";
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
      for (const key of Object.keys(record)) this.set(key, record[key]);
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

  get(key: string): any {
    const record = this.#getRawRecord();
    if (this.#table.getColumnSchema(key)) return record[key];
    return null;
  }

  getJSONValue(key: string): JSONValue {
    const record = this.#getRawRecord();
    const dataType = this.#table.getColumnSchema(key)?.getColumnType();
    if (dataType && typeof record[key] !== "undefined") {
      const jsonValue = <JSONValue> dataType.toJSONValue(record[key]);
      if (typeof jsonValue === "undefined") return null;
      return jsonValue;
    }
    return null;
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
    this.#queryBuilder.into(this.#table.getName());
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
    this.#queryBuilder.from(this.#table.getName());
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
      .map((columnSchema: ColumnDefinitionHandler) => {
        rawRecord[columnSchema.getName()] = columnSchema
          .getColumnType()
          .toJSONValue(this.get(columnSchema.getName()));
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
