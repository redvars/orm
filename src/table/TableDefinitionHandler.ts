import type {
  TColumnDefinitionStrict,
  TTableDefinition,
  TTableDefinitionStrict,
} from "../types.ts";
import type ColumnDefinitionHandler from "./ColumnDefinitionHandler.ts";

import TableDefinitionError from "../errors/TableDefinitionError.ts";
import { findDuplicates, getShortFormTableName } from "../utils.ts";
import Column from "./Column.ts";
import type RegistriesHandler from "../RegistriesHandler.ts";

export default class TableDefinitionHandler {
  readonly #tableDefinition: TTableDefinitionStrict;

  readonly #registriesHandler: RegistriesHandler;

  readonly #columnsMap: { [key: string]: Column } = {};

  constructor(
    tableDefinition: TTableDefinition,
    registriesHandler: RegistriesHandler,
  ) {
    this.#registriesHandler = registriesHandler;
    this.#tableDefinition = this.setDefaults(tableDefinition);
  }

  static getTableName(fullName: string): string {
    const parts = fullName.split(".");
    let tableName = fullName;
    if (parts.length == 2) {
      tableName = parts[1];
    }
    return tableName;
  }

  setDefaults(tableDefinition: TTableDefinition): TTableDefinitionStrict {
    tableDefinition = {
      final: false,
      columns: [],
      schema: "public",
      unique: [],
      ...tableDefinition,
    };

    if (tableDefinition.inherits) {
      tableDefinition.inherits = getShortFormTableName(
        tableDefinition.inherits,
      );
    }

    if (tableDefinition.columns) {
      for (let i = 0; i < tableDefinition.columns.length; i++) {
        const column = new Column(
          `${tableDefinition.schema}.${tableDefinition.name}`,
          tableDefinition.columns[i],
          this.#registriesHandler,
        );
        this.#columnsMap[column.getName()] = column;
        tableDefinition.columns[i] = column.getDefinitionClone();
      }
    }

    return <TTableDefinitionStrict> tableDefinition;
  }

  /**
   * Returns the short form of the table name.
   * @returns {string}
   *
   * @example
   * ("public.users"); // "users"
   * ("some_schema.tasks"); // "some_schema.tasks"
   */
  getName(): string {
    return getShortFormTableName(
      `${this.#tableDefinition.schema}.${this.#tableDefinition.name}`,
    );
  }

  getTableName(): string {
    return this.#tableDefinition.name;
  }

  getSchemaName(): string {
    return this.#tableDefinition.schema;
  }

  getInherits(): string | undefined {
    return this.#tableDefinition.inherits;
  }

  isFinal(): boolean {
    if (this.#tableDefinition.final === undefined) return false;
    return this.#tableDefinition.final;
  }

  getDefinitionClone(): TTableDefinitionStrict {
    return {
      ...this.#tableDefinition,
      columns: this.#tableDefinition.columns?.map(
        (column: TColumnDefinitionStrict) => {
          return {
            ...column,
          };
        },
      ),
    };
  }

  getExtendedTables(): string[] {
    let extendedTables = [this.getName()];
    const extendsTableName = this.getInherits();
    if (extendsTableName) {
      extendedTables = extendedTables.concat(
        this.#getTableDefinitionHandler(extendsTableName).getExtendedTables(),
      );
    }
    return extendedTables;
  }

  getBaseName(): string {
    let hostName = this.getName();
    const extendsTableName = this.getInherits();
    if (extendsTableName) {
      const extendedTableDefinition = this.#getTableDefinitionHandler(
        extendsTableName,
      );
      hostName = extendedTableDefinition.getBaseName();
    }
    return hostName;
  }

  getOwnColumns(): Column[] {
    const columns: Column[] = [];
    const extendsTableName = this.getInherits();
    if (!extendsTableName) {
      columns.push(
        new Column(
          this.getName(),
          {
            name: "id",
            type: "uuid",
            not_null: true,
            unique: true,
          },
          this.#registriesHandler,
        ),
        new Column(
          this.getName(),
          {
            name: "_table",
            type: "string",
            not_null: true,
            unique: false,
          },
          this.#registriesHandler,
        ),
      );
    }
    columns.push(
      ...this.#tableDefinition.columns.map(
        (column: TColumnDefinitionStrict) => {
          return new Column(this.getName(), column, this.#registriesHandler);
        },
      ),
    );
    return columns;
  }

  getColumns(): Column[] {
    const columns: Column[] = this.getOwnColumns();

    const extendsTableName = this.getInherits();
    if (
      extendsTableName &&
      this.#registriesHandler.hasTableDefinition(extendsTableName)
    ) {
      const extendedSchema = this.#getTableDefinitionHandler(extendsTableName);
      columns.push(...extendedSchema.getColumns());
    }
    return columns;
  }

  getUniqueConstraints(): string[][] {
    return this.#tableDefinition.unique;
  }

  getColumnNames(): string[] {
    return this.getColumns().map((f) => f.getName());
  }

  getOwnColumnNames(): string[] {
    return this.getOwnColumns().map((f) => f.getName());
  }

  getColumnSchema(name: string): ColumnDefinitionHandler | undefined {
    return this.getColumns().find((field) => field.getName() === name);
  }

  validate() {
    let tableDefinitionError: any = {
      columns: [],
    };

    /*
     * Validate table name
     */
    if (
      !this.#tableDefinition.name ||
      typeof this.#tableDefinition.name !== "string"
    ) {
      tableDefinitionError.name = "Invalid table name provided";
    } else if (!/^[a-z0-9_]+$/i.test(this.#tableDefinition.name)) {
      tableDefinitionError.name = "Table name should be alphanumeric";
    } else if (this.#registriesHandler.hasTableDefinition(this.getName())) {
      tableDefinitionError.name = "Table name already exists";
    }

    /*
     * Validate extends
     */
    const extendsTableName = this.getInherits();
    if (typeof extendsTableName === "string") {
      if (!this.#registriesHandler.hasTableDefinition(extendsTableName)) {
        tableDefinitionError.inherits =
          `${this.getName()} cannot inherit '${extendsTableName}'. '${this.getInherits()}' does not exists.`;
      } else {
        const extendsCol: TableDefinitionHandler = this
          .#getTableDefinitionHandler(extendsTableName);
        if (extendsCol.isFinal()) {
          tableDefinitionError.inherits =
            `${this.getName()} cannot inherit '${extendsTableName}'. '${this.getInherits()}' is final table schema.`;
        }
      }
    }

    /*
     * Validate columns
     */
    const columnSchemas = this.getOwnColumns();
    for (const columnSchema of columnSchemas) {
      try {
        columnSchema.validate();
      } catch (error) {
        tableDefinitionError.columns.push(error);
      }
    }

    const allColumnNames: string[] = this.getColumns().map((f) => f.getName());
    const duplicates = findDuplicates(allColumnNames);
    if (duplicates.length) {
      tableDefinitionError.duplicateFields = `Duplicate fields -> ${
        duplicates.join(
          ",",
        )
      }`;
    }

    if (
      Object.keys(tableDefinitionError).length > 1 ||
      tableDefinitionError.columns.length > 0
    ) {
      throw new TableDefinitionError(
        `${this.#tableDefinition.schema}.${this.#tableDefinition.name}`,
        tableDefinitionError,
      );
    }
  }

  #getTableDefinitionHandler(tableName: string): TableDefinitionHandler {
    const schema = this.#registriesHandler.getTableDefinition(tableName);
    if (!schema) {
      throw Error(`[Schema::_getSchema] Schema not found :: ${tableName}`);
    }
    return new TableDefinitionHandler(schema, this.#registriesHandler);
  }
}
