type ORMErrorCode =
  | "GENERAL"
  | "DATABASE_DOES_NOT_EXISTS"
  | "QUERY"
  | "TABLE_DEFINITION_VALIDATION"
  | "RECORD_VALIDATION";

export default class ORMError extends Error {
  public readonly code: ORMErrorCode;
  public override readonly cause?: any;

  constructor(code: ORMErrorCode, message: string, cause?: any) {
    super(message);
    this.name = "ORMError";
    this.code = code;
    this.cause = cause;
  }

  static generalError(message: string, cause?: any) {
    throw new ORMError("GENERAL", message, cause);
  }

  static databaseDoesNotExistsError(databaseName?: string) {
    throw new ORMError(
      "DATABASE_DOES_NOT_EXISTS",
      `Database ${databaseName} does not exist.`,
    );
  }

  static queryError(message: string, cause?: any) {
    throw new ORMError("QUERY", message, cause);
  }

  static tableDefinitionValidationError(cause: any) {
    throw new ORMError(
      "TABLE_DEFINITION_VALIDATION",
      "Table definition validation failed",
      cause,
    );
  }

  static recordValidationError(cause?: any) {
    throw new ORMError("RECORD_VALIDATION", "Record validation failed", cause);
  }
}
