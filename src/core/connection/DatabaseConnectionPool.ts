import { type Logger, LoggerUtils, pg } from "../../../deps.ts";
import type { TDatabaseConfiguration } from "../types.ts";
import ORMError from "../../errors/ORMError.ts";
import { DatabaseClient } from "./DatabaseClient.ts";

/**
 * DatabaseConnectionPool class manage connections to the database.
 *
 * @class
 * @classdesc DatabaseConnectionPool class to manage connections to the database.
 * @param {TDatabaseConfiguration} configuration - Database configuration.
 * @param {Logger} logger - Logger instance.
 * @returns {DatabaseConnectionPool} - Database connection instance.
 *
 * @example
 * ```ts
 *  new DatabaseConnectionPool({
 *   host: "127.0.0.1",
 *   port: 5432,
 *   username: "postgres",
 *   password: "postgres",
 *   database: "project-management-system"
 * ```
 * });
 */
export default class DatabaseConnectionPool {
  readonly #config: TDatabaseConfiguration;
  readonly #pgPool: pg.Pool;
  readonly #logger: Logger;

  constructor(configuration: TDatabaseConfiguration, logger?: Logger) {
    this.#config = configuration;
    this.#pgPool = new pg.Pool({
      user: this.#config.username,
      database: this.#config.database || "postgres",
      password: this.#config.password,
      port: this.#config.port || 5432,
      host: this.#config.hostname,
      max: this.#config.max_connections || 20,
      connectionTimeoutMillis: this.#config.connect_timeout,
    });
    this.#logger = logger || LoggerUtils.getLogger(DatabaseConnectionPool.name);
  }

  /**
   * Creates a connection to the database. And test the connection.
   *
   * @param {TDatabaseConfiguration} configuration - Database configuration.
   * @returns {Promise<DatabaseConnectionPool>} A promise that resolves with a connection to the database.
   * @throws {ORMError} Throws an error if the connection could not be established.
   */
  static async createConnectionPoll(
    configuration: TDatabaseConfiguration,
  ): Promise<DatabaseConnectionPool> {
    const pool = new DatabaseConnectionPool(configuration);
    await pool.testConnection();
    return pool;
  }

  /**
   * Establishes a connection to the database.
   *
   * @returns {Promise<void>} A promise that resolves when the connection is successfully established.
   * @throws {ORMError} Throws an error if the connection could not be established.
   */
  async testConnection(): Promise<void> {
    let client;
    try {
      client = await this.#pgPool.connect();
      await client.query(`select 1`);
      this.#logger.info(
        `Connected to ${this.#config.database} database successfully`,
      );
    } catch (err: any) {
      if (this.#pgPool) this.#pgPool.end();
      this.#logger.error(err.message);
      if (err.code === "3D000") {
        throw ORMError.databaseDoesNotExistsError(this.#config.database);
      } else throw err;
    }
    if (client) {
      client.release();
    }
  }

  /**
   * Returns a connection to the database.
   *
   * @returns {Promise<DatabaseClient>} A promise that resolves with a connection to the database.
   * @throws {ORMError} Throws an error if the connection pool is not present.
   */
  async connect(): Promise<DatabaseClient> {
    if (!this.#pgPool) {
      throw ORMError.generalError("Connection pool is not present.");
    }
    return new DatabaseClient(await this.#pgPool.connect());
  }

  /**
   * Returns the database name.
   *
   * @returns {string | undefined} The database name.
   */
  getDatabaseName(): string | undefined {
    return this.#config.database;
  }

  /**
   * Creates a database.
   *
   * @param {string} databaseName - The name of the database.
   * @returns {Promise<any>} A promise that resolves when the database is created.
   * @throws {Error} Throws an error if no database name is provided.
   */
  async createDatabase(databaseName: string): Promise<any> {
    if (!databaseName) {
      throw ORMError.generalError("No database name provided to create.");
    }
    const client = await this.connect();
    const result = await client.executeQuery(
      `CREATE DATABASE "${databaseName}"`,
    );
    this.#logger.info(`Database ${databaseName} created successfully`);
    client.release();
    return result;
  }

  /**
   * Drops a database.
   *
   * @param {string} databaseName - The name of the database.
   * @returns {Promise<any>} A promise that resolves when the database is dropped.
   * @throws {Error} Throws an error if no database name is provided.
   */
  async dropDatabase(databaseName: string): Promise<any> {
    if (!databaseName) {
      throw ORMError.generalError("No database name provided to drop.");
    }
    const client = await this.connect();
    const result = await client.executeQuery(`DROP DATABASE "${databaseName}"`);
    this.#logger.info(`Database ${databaseName} dropped successfully`);
    client.release();
    return result;
  }

  async executeQuery(query: string): Promise<pg.QueryResult> {
    return await this.#pgPool.query({
      text: query,
    });
  }

  on(event: string, callback: any) {
    this.#pgPool.on(event, callback);
  }

  end(): void {
    this.#pgPool.end();
  }
}
