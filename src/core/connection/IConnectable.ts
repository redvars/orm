import type { DatabaseClient } from "./DatabaseClient.ts";

/**
 * Anything that can hand out a `DatabaseClient` on demand. Implemented by
 * `DatabaseConnectionPool` (a fresh reservation each call) and by
 * `TransactionConnection` (always the same already-open client, for the
 * duration of a transaction).
 */
export default interface IConnectable {
  connect(): Promise<DatabaseClient>;
}
