import { getFullFormTableName } from "../../../utils.ts";
import type { __TColumnDefinitionNative } from "../../../types.ts";
import type IQuery from "../IQuery.ts";

export default class CreateQuery implements IQuery {
  readonly #tableName: string;

  #columns: __TColumnDefinitionNative[] = [];

  #unique: string[][] = [];

  constructor(tableName: string) {
    this.#tableName = getFullFormTableName(tableName);
  }

  addColumn(column: __TColumnDefinitionNative): CreateQuery {
    column = { ...column };
    this.#columns.push(column);
    return this;
  }

  addUnique(columns: string[]): CreateQuery {
    this.#unique.push(columns);
    return this;
  }

  buildQuery(): string {
    const statements = this.#prepareColumns();
    statements.push(...this.#prepareUnique());
    statements.push(this.#preparePrimaryKey());

    let query = `CREATE TABLE ${this.#tableName}`;
    query += ` (`;
    query += statements.join(", ");
    query += `)`;
    return query;
  }

  #prepareColumn(column: __TColumnDefinitionNative): string {
    let query = `"${column.name}" ${column.native_type}`;
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
    return this.#columns.map(this.#prepareColumn);
  }

  #prepareUnique(): string[] {
    const uniqueConstraints = [...this.#unique];
    const uniqueColumns = this.#columns.filter((column) =>
      column.name != "id" && column.unique
    );
    for (const column of uniqueColumns) {
      uniqueConstraints.push([column.name]);
    }
    return uniqueConstraints.map((columns) => {
      return `UNIQUE (${columns.map((column) => `"${column}"`).join(", ")})`;
    });
  }

  #preparePrimaryKey(): string {
    return `PRIMARY KEY (id)`;
  }
}
