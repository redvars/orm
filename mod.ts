import ORM from "./src/ORM.ts";
import ORMClient from "./src/ORMClient.ts";
import TransactionClient from "./src/TransactionClient.ts";
import Record from "./src/record/Record.ts";
import Table from "./src/table/Table.ts";
import Column from "./src/table/Column.ts";

import RecordInterceptor from "./src/operation-interceptor/RecordInterceptor.ts";
import Query from "./src/query/Query.ts";
import IDataType from "./src/data-types/IDataType.ts";
import ORMError from "./src/errors/ORMError.ts";
import WhereClause from "./src/core/query-builder/CLAUSES/WhereClause.ts";

export {
  Column,
  IDataType,
  ORM,
  ORMClient,
  ORMError,
  Query,
  Record,
  RecordInterceptor,
  Table,
  TransactionClient,
  WhereClause,
};

export { RecordSaveError } from "./src/errors/RecordSaveError.ts";

export type {
  JSONArray,
  JSONObject,
  JSONPrimitive,
  JSONValue,
  UUID4,
} from "./deps.ts";

export type {
  SimpleCondition,
  TColumnDataType,
  TColumnDefinition,
  TForeignKey,
  TRecord,
  /**
   * Types
   */
  TRecordInterceptorContext,
  TRecordInterceptorType,
  /**
   * Definitions
   */
  TTableDefinition,
} from "./src/types.ts";

export type {
  TDatabaseConfiguration,
  TOrderBy,
  TOrderByDirection,
  TWhereClauseOperator,
} from "./src/core/types.ts";
