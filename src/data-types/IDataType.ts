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
   * Coerces a value into this type's JSON-safe representation (e.g. a UTC
   * ISO string for `Temporal.PlainDate`). This is the value stored on
   * `Record` and returned directly by `Record#get`. Used both for
   * user-supplied values (`Record#set`) and for raw values as returned by
   * the Postgres driver (npm:pg) when hydrating a `Record` from a query
   * result row - implementations must accept both shapes.
   */
  abstract setValueIntercept(value: unknown): JSONValue;

  /**
   * Converts the stored JSON-safe value (as produced by `setValueIntercept`)
   * back into this type's canonical JS representation (e.g.
   * `Temporal.PlainDate`), used by `Record#getObject`.
   */
  abstract getObjectIntercept(value: unknown): any;

  /**
   * Optional human-friendly formatting of the stored JSON-safe value, e.g.
   * for UI display. Defaults to the JSON representation; override for a
   * nicer display string.
   */
  getDisplayValue(value: unknown): string {
    return value === null || typeof value === "undefined" ? "" : String(value);
  }

  abstract validateValue(value: unknown): Promise<void>;
}

export default IDataType;
