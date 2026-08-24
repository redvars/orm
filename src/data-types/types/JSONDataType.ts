import IDataType from "../IDataType.ts";
import type { TColumnDataType, TColumnDefinitionStrict } from "../../types.ts";
import type { JSONValue } from "../../../deps.ts";

export default class JSONDataType extends IDataType {
  constructor() {
    super("json");
  }

  getNativeType(_definition: TColumnDefinitionStrict): TColumnDataType {
    return "JSON";
  }

  validateDefinition(_definition: TColumnDefinitionStrict) {}

  setValueIntercept(value: JSONValue): JSONValue {
    return value;
  }

  getObjectIntercept(value: JSONValue): JSONValue {
    return value;
  }

  async validateValue(value: any) {
    if (value === null || typeof value === "object") return;
    throw new Error(`Invalid JSON value: ${value}`);
  }
}
