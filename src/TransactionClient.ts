import type { Logger } from "../deps.ts";
import type { TRecordInterceptorContext, TTableDefinitionStrict } from "./types.ts";
import type IConnectable from "./core/connection/IConnectable.ts";
import Table from "./table/Table.ts";
import Query from "./query/Query.ts";
import type RegistriesHandler from "./RegistriesHandler.ts";
import ORMError from "./errors/ORMError.ts";

/**
 * Scoped view of an `ORMClient` for use inside `ORMClient.transaction()`.
 * Every `Table`/`Query` obtained from this class shares the transaction's
 * single reserved connection instead of each independently reserving its own
 * from the pool.
 *
 * DDL (`defineTable()`/`dropTable()`) is intentionally not exposed here -
 * those manage their own connection reservation internally and are not
 * supported inside a transaction in this release.
 */
export default class TransactionClient {
  readonly #connection: IConnectable;
  readonly #registriesHandler: RegistriesHandler;
  readonly #logger: Logger;

  constructor(
    connection: IConnectable,
    registriesHandler: RegistriesHandler,
    logger: Logger,
  ) {
    this.#connection = connection;
    this.#registriesHandler = registriesHandler;
    this.#logger = logger;
  }

  table(name: string, context?: TRecordInterceptorContext): Table {
    const tableDefinition: TTableDefinitionStrict | undefined = this
      .#registriesHandler.getTableDefinition(name);
    if (typeof tableDefinition === "undefined") {
      throw new ORMError(
        "TABLE_DEFINITION_VALIDATION",
        `Table with name '${name}' is not defined`,
      );
    }
    return new Table(
      this.#connection,
      tableDefinition,
      this.#registriesHandler,
      this.#logger,
      context,
    );
  }

  query(): Query {
    return new Query(this.#connection);
  }
}
