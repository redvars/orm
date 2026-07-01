import { getFullFormTableName } from "../utils.ts";
import type { __TColumnDefinitionNative } from "../types.ts";

export class AlterQuery {
  readonly #tableName: string;

  #addColumns: __TColumnDefinitionNative[] = [];

  #unique: string[][] = [];

  constructor(tableName: string) {
    this.#tableName = getFullFormTableName(tableName);
  }

  addColumn(column: __TColumnDefinitionNative): AlterQuery {
    column = { ...column };
    this.#addColumns.push(column);
    return this;
  }

  addUnique(columns: string[]): AlterQuery {
    this.#unique.push(columns);
    return this;
  }

  buildQuery(): string {
    const statements = this.#prepareColumns();
    statements.push(...this.#prepareUnique());

    let query = `ALTER TABLE ${this.#tableName} \n\t`;
    query += statements.join(", ");
    return query;
  }

  #prepareColumn(column: __TColumnDefinitionNative): string {
    let query = `ADD COLUMN "${column.name}" ${column.native_type}`;
    if (column.foreign_key) {
      const onDelete = column.foreign_key.on_delete
        ? ` ON DELETE ${column.foreign_key.on_delete}`
        : "";
      query += ` REFERENCES ${
        getFullFormTableName(
          column.foreign_key.table,
        )
      } ("${column.foreign_key.column}") ${onDelete}`;
    } else {
      if (column.not_null) query += ` NOT NULL`;
    }
    return query;
  }

  #prepareColumns(): string[] {
    return this.#addColumns.map(this.#prepareColumn);
  }

  #prepareUnique(): string[] {
    const uniqueConstraints = [...this.#unique];
    const uniqueColumns = this.#addColumns.filter(
      (column) => column.name != "id" && column.unique,
    );

    for (const column of uniqueColumns) {
      uniqueConstraints.push([column.name]);
    }

    return uniqueConstraints.map((columns) => {
      return `ADD UNIQUE (${
        columns
          .map((column) => `"${column}"`)
          .join(", ")
      })`;
    });
  }
}
