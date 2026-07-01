import Registry from "./Registry.ts";
import type IDataType from "./data-types/IDataType.ts";
import type {
  TRecordInterceptorContext,
  TRecordInterceptorType,
  TTableDefinitionStrict,
} from "./types.ts";
import Table from "./table/Table.ts";
import DatabaseOperationInterceptorService from "./operation-interceptor/DatabaseOperationInterceptorService.ts";
import type RecordInterceptor from "./operation-interceptor/RecordInterceptor.ts";
import type Record from "./record/Record.ts";

export default class RegistriesHandler {
  readonly #tableDefinitionRegistry: Registry<TTableDefinitionStrict> =
    new Registry<TTableDefinitionStrict>(function (tableDefinition) {
      return Table.getShortFormTableName(
        `${tableDefinition.schema}.${tableDefinition.name}`,
      );
    });
  readonly #dataTypeRegistry: Registry<IDataType> = new Registry<IDataType>(
    function (dataType): string {
      return dataType.getName();
    },
  );
  readonly #operationInterceptorService: DatabaseOperationInterceptorService =
    new DatabaseOperationInterceptorService();

  addDataType(dataType: IDataType): void {
    this.#dataTypeRegistry.add(dataType);
  }

  hasDataType(name: string): boolean {
    return this.#dataTypeRegistry.has(name);
  }

  getDataType(name: string): IDataType | undefined {
    return this.#dataTypeRegistry.get(name);
  }

  addTableDefinition(tableDefinition: TTableDefinitionStrict): void {
    this.#tableDefinitionRegistry.add(tableDefinition);
  }

  getTableDefinition(tableName: string): TTableDefinitionStrict | undefined {
    return this.#tableDefinitionRegistry.get(tableName);
  }

  hasTableDefinition(tableName: string): boolean {
    return this.#tableDefinitionRegistry.has(tableName);
  }

  deleteTableDefinition(tableName: string): void {
    this.#tableDefinitionRegistry.delete(tableName);
  }

  getAllTableDefinitions(): TTableDefinitionStrict[] {
    return this.#tableDefinitionRegistry.values();
  }

  addInterceptor(operationInterceptor: RecordInterceptor): void {
    this.#operationInterceptorService.addInterceptor(operationInterceptor);
  }

  deleteInterceptor(name: string): void {
    this.#operationInterceptorService.deleteInterceptor(name);
  }

  async intercept(
    table: Table,
    operation: TRecordInterceptorType,
    records: Record[],
    context?: TRecordInterceptorContext,
    disabledIntercepts?: boolean | string[],
  ): Promise<Record[]> {
    return await this.#operationInterceptorService.intercept(
      table,
      operation,
      records,
      context,
      disabledIntercepts,
    );
  }
}
