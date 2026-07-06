import { pgFormat } from "../../deps.ts";
import type { DatabaseClient } from "../core/connection/DatabaseClient.ts";
import { generateUUID, runSQLQuery } from "../utils.ts";
import type { TMigrationChangeType } from "./types.ts";

/**
 * Audit trail of every schema change `ORMClient.defineTable()` actually
 * applies, recorded to `public._orm_migrations`. This is not a migration-file
 * system - there are no versions and no down-migrations, just a lazily
 * created ledger table for after-the-fact auditability.
 */
export default class MigrationLedger {
  async ensureLedgerTable(client: DatabaseClient): Promise<void> {
    await runSQLQuery(
      client,
      `CREATE TABLE IF NOT EXISTS public._orm_migrations (
        id uuid PRIMARY KEY,
        table_name text NOT NULL,
        change_type text NOT NULL,
        detail jsonb,
        applied_at timestamptz NOT NULL DEFAULT now()
      );`,
    );
  }

  async record(
    client: DatabaseClient,
    entry: {
      tableName: string;
      changeType: TMigrationChangeType;
      detail?: Record<string, unknown>;
    },
  ): Promise<void> {
    const sql = pgFormat(
      `INSERT INTO public._orm_migrations (id, table_name, change_type, detail) VALUES (%L, %L, %L, %L);`,
      generateUUID(),
      entry.tableName,
      entry.changeType,
      JSON.stringify(entry.detail ?? {}),
    );
    await runSQLQuery(client, sql);
  }
}
