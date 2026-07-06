import { type pg, PgCursor, pgFormat } from "../../../deps.ts";

export class DatabaseClient {
  readonly #pgClient: pg.Client;

  readonly #releasable: boolean;

  constructor(client: pg.Client, options?: { releasable?: boolean }) {
    this.#pgClient = client;
    this.#releasable = options?.releasable ?? true;
  }

  /**
   * Returns a view over this same underlying connection whose `release()` is
   * a no-op. Used to run multiple operations against one physical connection
   * (e.g. inside a transaction) without any of them prematurely releasing it
   * back to the pool - only the original, releasable handle should do that.
   */
  withNonReleasingHandle(): DatabaseClient {
    return new DatabaseClient(this.#pgClient, { releasable: false });
  }

  async doesSchemaExist(schemaName: string): Promise<boolean> {
    const query = pgFormat(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = %L`,
      schemaName,
    );
    const result = await this.executeQuery(query);
    return result.rowCount > 0;
  }

  async createSchema(schemaName: string): Promise<void> {
    const query = pgFormat(`CREATE SCHEMA IF NOT EXISTS %I`, schemaName);
    await this.executeQuery(query);
  }

  async executeQuery(query: string): Promise<pg.QueryResult> {
    return await this.#pgClient.query({
      text: query,
    });
  }

  async createCursor(query: string): Promise<pg.Cursor> {
    return await this.#pgClient.query(new PgCursor(query));
  }

  on(event: string, callback: any) {
    this.#pgClient.on(event, callback);
  }

  release() {
    if (this.#releasable) this.#pgClient.release();
  }
}
