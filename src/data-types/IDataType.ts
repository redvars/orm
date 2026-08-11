import type { TColumnDataType, TColumnDefinitionStrict } from "../types.ts";
import type { JSONValue } from "../../deps.ts";

abstract class IDataType {
  readonly #name: string;

  protected constructor(name: string) {
    this.#name = name;
  }

  getName(): string {
    return this.#name;
  }

  abstract getNativeType(definition: TColumnDefinitionStrict): TColumnDataType;

  /**
   * Validate the column definition
   * @param definition
   * @throws {Error} if the definition is invalid
   */
  abstract validateDefinition(definition: TColumnDefinitionStrict): void;

  /**
   * Coerces a user-supplied value (`Record#set`) into this type's canonical
   * JS representation (e.g. `Temporal.PlainDate`). Parsing a raw value as
   * returned by the Postgres driver (npm:pg) for a query result row is
   * handled generically by `src/data-types/nativeTypeUtils.ts`, keyed by
   * this type's native SQL type rather than by individual `IDataType`.
   */
  abstract setValueIntercept(value: unknown): any;

  /**
   * Serializes the canonical JS representation to a JSON-safe value (e.g. a
   * UTC ISO string for date/time types), used by `Record#toJSON`/
   * `Record#getJSONValue`.
   */
  abstract toJSONValue(value: unknown): JSONValue;

  /**
   * Optional human-friendly formatting of the canonical value, e.g. for UI
   * display. Defaults to the JSON representation; override for a nicer
   * display string.
   */
  getDisplayValue(value: unknown): string {
    const jsonValue = this.toJSONValue(value);
    return jsonValue === null || typeof jsonValue === "undefined"
      ? ""
      : String(jsonValue);
  }

  abstract validateValue(value: unknown): Promise<void>;
}

export default IDataType;
