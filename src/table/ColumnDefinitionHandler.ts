import type IDataType from "../data-types/IDataType.ts";
import type { TColumnDefinition, TColumnDefinitionStrict } from "../types.ts";
import ORMError from "../errors/ORMError.ts";

export default class ColumnDefinitionHandler {
  readonly #columnDefinition: TColumnDefinitionStrict;

  readonly #dataType?: IDataType;
  readonly #tableName: string;

  constructor(
    tableName: string,
    columnDefinition: TColumnDefinition,
    dataType?: IDataType,
  ) {
    this.#tableName = tableName;
    this.#dataType = dataType;
    this.#columnDefinition = ColumnDefinitionHandler.setDefaults(
      columnDefinition,
    );
  }

  static setDefaults(
    columnDefinition: TColumnDefinition,
  ): TColumnDefinitionStrict {
    return {
      not_null: false,
      unique: false,
      default: null,
      ...columnDefinition,
    };
  }

  getTableName(): string {
    return this.#tableName;
  }

  isUnique(): boolean {
    return !!this.#columnDefinition.unique;
  }

  isNotNull(): boolean {
    return !!this.#columnDefinition.not_null;
  }

  getName(): string {
    return this.#columnDefinition.name;
  }

  getType(): string {
    return this.#columnDefinition.type;
  }

  getDefinitionClone(): TColumnDefinitionStrict {
    return {
      ...this.#columnDefinition,
    };
  }

  getDefaultValue(): any {
    if (typeof this.#columnDefinition.default === "undefined") {
      return null;
    }
    return this.#columnDefinition.default;
  }

  getColumnType(): IDataType {
    if (!this.#dataType) {
      throw ORMError.generalError("No such field type");
    }
    return this.#dataType;
  }

  getNativeType(): string {
    if (!this.#dataType) {
      throw ORMError.generalError("No such field type");
    }
    return this.#dataType.getNativeType(this.getDefinitionClone());
  }

  validate(): void {
    const error: {
      name: string;
      errors: {
        name?: string;
        value?: any;
        message: string;
      }[];
    } = {
      name: this.getName(),
      errors: [],
    };

    /*
     * Validate column name
     */
    if (!this.getName() || typeof this.getName() !== "string") {
      error.errors.push({
        name: "name",
        value: this.getName(),
        message: "Invalid column name provided",
      });
    } else if (!/^[a-z0-9_]+$/i.test(this.getName())) {
      error.errors.push({
        name: "name",
        value: this.getName(),
        message: "Column name should be alphanumeric",
      });
    }

    if (!this.getType()) {
      error.errors.push({
        name: "type",
        value: this.getType(),
        message: "Column type not provided",
      });
    } else if (!this.#dataType) {
      error.errors.push({
        name: "type",
        value: this.getType(),
        message: `No such column type "${this.getType()}"`,
      });
    } else {
      try {
        this.getColumnType().validateDefinition(this.#columnDefinition);
      } catch (e: any) {
        error.errors.push({
          message: e.message,
        });
      }
    }

    if (error.errors.length > 0) {
      throw error;
    }
  }
}
