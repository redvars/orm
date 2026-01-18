import DatabaseConnectionPool from "./core/connection/DatabaseConnectionPool.ts";
import type { TDatabaseConfiguration } from "./core/types.ts";
import type IDataType from "./data-types/IDataType.ts";

import StringDataType from "./data-types/types/StringDataType.ts";
import ORMClient from "./ORMClient.ts";
import IntegerDataType from "./data-types/types/IntegerDataType.ts";
import NumberDataType from "./data-types/types/NumberDataType.ts";
import JSONDataType from "./data-types/types/JSONDataType.ts";
import BooleanDataType from "./data-types/types/BooleanDataType.ts";
import DateDataType from "./data-types/types/DateDataType.ts";
import DateTimeDataType from "./data-types/types/DateTimeDataType.ts";
import UUIDDataType from "./data-types/types/UUIDDataType.ts";
import type RecordInterceptor from "./operation-interceptor/RecordInterceptor.ts";
import TimeDataType from "./data-types/types/TimeDataType.ts";
import CharDataType from "./data-types/types/CharDataType.ts";
import { type Logger, LoggerUtils, type UUID4 } from "../deps.ts";
import RegistriesHandler from "./RegistriesHandler.ts";
import { generateUUID, validateUUID } from "./utils.ts";

/**
 * JUSTAOS's ORM (Object Document Mapper) is built for Deno and provides transparent persistence for JavaScript objects to Postgres database.
 * - Supports all primitive data types (string, integer, float, boolean, date, object, array, etc).
 * - Supports custom data types.
 * - Supports table with multi-level inheritance.
 * - Also supports interception on operations (create, read, update and delete).
 *
 * @example
 * ```ts
 * import { ORM } from "@justaos/orm";
 *
 * const odm = new ORM({
 *  hostname: "localhost",
 *  port: 5432,
 *  username: "postgres",
 *  password: "postgres",
 *  max_connections: 20
 * });
 *
 * odm.connect();
 * ```
 */
export default class ORM {
  readonly #logger: Logger;
  readonly #config: TDatabaseConfiguration;

  readonly #registryHandler = new RegistriesHandler();

  constructor(config: TDatabaseConfiguration, logger?: Logger) {
    this.#loadBuildInFieldTypes();
    this.#config = config;
    this.#logger = logger || LoggerUtils.getLogger(ORM.name);
  }

  /**
   * Generates a new record ID.
   */
  static generateRecordId(): UUID4 {
    return <UUID4> generateUUID();
  }

  /**
   * Checks if the given ID is a valid record ID.
   * @param id
   */
  static isValidRecordId(id: UUID4): boolean {
    return validateUUID(id);
  }

  /**
   * Establishes a connection to the database.
   * @param createDatabaseIfNotExists If true, creates the database if it does not exist.
   */
  async connect(createDatabaseIfNotExists?: boolean): Promise<ORMClient> {
    try {
      const client = new ORMClient(
        this.#logger,
        this.#config,
        this.#registryHandler,
      );
      await client.testConnection();
      return client;
    } catch (error: any) {
      if (
        error.code === "DATABASE_DOES_NOT_EXISTS" &&
        this.#config.database &&
        createDatabaseIfNotExists
      ) {
        const tempClient = new DatabaseConnectionPool({
          ...this.#config,
          database: "postgres",
        }, this.#logger);
        await tempClient.testConnection();
        await tempClient.createDatabase(this.#config.database);
        tempClient.end();
        return await this.connect(false);
      } else {
        throw error;
      }
    }
  }

  /**
   * Checks if a table is defined in the registry.
   * @param tableName
   */
  isTableDefined(tableName: string): boolean {
    return this.#registryHandler.hasTableDefinition(tableName);
  }

  /**
   * Adds a new data type to the registry.
   * @param dataType
   */
  addDataType(dataType: IDataType): void {
    this.#registryHandler.addDataType(dataType);
  }

  /**
   * Adds a new operation interceptor to the service.
   * @param operationInterceptor
   */
  addInterceptor(operationInterceptor: RecordInterceptor): void {
    this.#registryHandler.addInterceptor(operationInterceptor);
  }

  /**
   * Deletes an operation interceptor from the service.
   * @param operationInterceptorName
   */
  deleteInterceptor(operationInterceptorName: string): void {
    this.#registryHandler.deleteInterceptor(operationInterceptorName);
  }

  /**
   * Loads the built-in field types.
   * @private
   */
  #loadBuildInFieldTypes(): void {
    this.addDataType(new BooleanDataType());
    this.addDataType(new CharDataType());
    this.addDataType(new DateDataType());
    this.addDataType(new DateTimeDataType());
    this.addDataType(new IntegerDataType());
    this.addDataType(new JSONDataType());
    this.addDataType(new NumberDataType());
    this.addDataType(new StringDataType());
    this.addDataType(new TimeDataType());
    this.addDataType(new UUIDDataType());
  }
}
