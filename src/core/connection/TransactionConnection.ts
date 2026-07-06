import type { DatabaseClient } from "./DatabaseClient.ts";
import type IConnectable from "./IConnectable.ts";

/**
 * An `IConnectable` that always resolves to the same already-open
 * `DatabaseClient`, so every `Query`/`Table` operation created within a
 * transaction shares one physical connection instead of each independently
 * reserving its own from the pool.
 */
export default class TransactionConnection implements IConnectable {
  readonly #client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.#client = client;
  }

  connect(): Promise<DatabaseClient> {
    return Promise.resolve(this.#client);
  }
}
