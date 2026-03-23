import type { Executor } from "./executor";
import type { Query } from "./query";
import type { BigIntString, Either, NumericString } from "./type-utils";

export interface AdapterRequirements {
  executor: Executor;
  noParameters?: boolean;
}

export interface AdapterCapabilities {
  /**
   * Whether full-table content search is supported by this adapter.
   */
  fullTableSearch: boolean;

  /**
   * SQL dialect used by SQL editor highlighting/autocomplete.
   */
  sqlDialect: SqlEditorDialect;

  /**
   * Whether SQL editor schema-aware autocomplete is supported.
   */
  sqlEditorAutocomplete: boolean;

  /**
   * Whether SQL editor lint diagnostics are supported.
   */
  sqlEditorLint: boolean;
}

export interface Adapter {
  /**
   * The schema studio will choose by default.
   *
   * e.g. `public` for PostgreSQL
   */
  readonly defaultSchema?: string;

  /**
   * Optional adapter feature flags used by the UI.
   */
  readonly capabilities?: Partial<AdapterCapabilities>;

  /**
   * Introspects the database and returns structured information about the schemas, tables, etc.
   *
   * @param options - Options for the introspection request.
   */
  introspect(
    options: AdapterIntrospectOptions,
  ): Promise<Either<AdapterError, AdapterIntrospectResult>>;

  /**
   * Executes a structured query against the database.
   */
  query(
    details: AdapterQueryDetails,
    options: AdapterQueryOptions,
  ): Promise<Either<AdapterError, AdapterQueryResult>>;

  /**
   * Executes raw SQL against the database.
   */
  raw(
    details: AdapterRawDetails,
    options: AdapterRawOptions,
  ): Promise<Either<AdapterError, AdapterRawResult>>;

  /**
   * Returns schema metadata for SQL editor autocomplete.
   */
  sqlSchema?(
    details: AdapterSqlSchemaDetails,
    options: AdapterSqlSchemaOptions,
  ): Promise<Either<AdapterError, AdapterSqlSchemaResult>>;

  /**
   * Returns SQL editor diagnostics (syntax/schema linting).
   */
  sqlLint?(
    details: AdapterSqlLintDetails,
    options: AdapterSqlLintOptions,
  ): Promise<Either<AdapterError, AdapterSqlLintResult>>;

  /**
   * Inserts a single row into the database.
   */
  insert(
    details: AdapterInsertDetails,
    options: AdapterInsertOptions,
  ): Promise<Either<AdapterError, AdapterInsertResult>>;

  /**
   * Updates a given row in the database with given changes.
   */
  update(
    details: AdapterUpdateDetails,
    options: AdapterUpdateOptions,
  ): Promise<Either<AdapterError, AdapterUpdateResult>>;

  /**
   * Updates multiple rows in the database inside one adapter-level transaction
   * when supported by the executor.
   */
  updateMany?(
    details: AdapterUpdateManyDetails,
    options: AdapterUpdateOptions,
  ): Promise<Either<AdapterError, AdapterUpdateManyResult>>;

  /**
   * Deletes given rows from the database.
   */
  delete(
    details: AdapterDeleteDetails,
    options: AdapterDeleteOptions,
  ): Promise<Either<AdapterError, AdapterDeleteResult>>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdapterBaseOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdapterIntrospectOptions extends AdapterBaseOptions {}

export interface AdapterQueryOptions extends AdapterBaseOptions {
  abortSignal: AbortSignal;
}

export interface AdapterRawOptions extends AdapterBaseOptions {
  abortSignal: AbortSignal;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdapterSqlSchemaOptions extends AdapterBaseOptions {}

export interface AdapterSqlLintOptions extends AdapterBaseOptions {
  abortSignal: AbortSignal;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdapterInsertOptions extends AdapterBaseOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdapterUpdateOptions extends AdapterBaseOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdapterDeleteOptions extends AdapterBaseOptions {}

type SchemaName = string;

export interface AdapterIntrospectResult {
  schemas: Record<SchemaName, Schema>;
  timezone: string;
  filterOperators: FilterOperator[];
  query: Query;
}

type TableName = string;

export interface Schema {
  name: string;
  tables: Record<TableName, Table>;
}

type ColumnName = string;

export interface Table {
  columns: Record<ColumnName, Column>;
  name: TableName;
  schema: SchemaName;
}

export interface Column {
  datatype: DataType;
  defaultValue:
    | "CURRENT_DATE"
    | "CURRENT_TIME"
    | "CURRENT_TIMESTAMP"
    | "datetime('now')" // sqlite
    | "gen_random_uuid()" // postgres uuid
    | "json_array()" // mysql empty json array
    | `nextval(${string})` // postgres serial/autoinc
    | `now()`
    | "uuid_to_bin(uuid())" // mysql binary uuid
    | "uuid()" // mysql uuid
    | (string & {})
    | null;
  fkColumn: ColumnName | null;
  fkSchema: SchemaName | null;
  fkTable: TableName | null;
  isAutoincrement: boolean;
  isComputed: boolean;
  isRequired: boolean;
  name: ColumnName;
  nullable: boolean;
  pkPosition: number | null;
  schema: SchemaName;
  table: TableName;
}

export interface DataType {
  /**
   * The database-specific affinity/type.
   *
   * e.g. in SQLite, datatypes can be anything. They are reduced to affinity via string matching rules.
   *
   * {@link https://sqlite.org/datatype3.html#determination_of_column_affinity}
   */
  affinity?: string;

  /**
   * The database-specific format for the datatype.
   */
  format?: string;

  /**
   * A simplification/normalization for UI usage.
   *
   * e.g. varchar and char are strings.
   */
  group: DataTypeGroup;

  /**
   * Is this a native array type?
   */
  isArray: boolean;

  /**
   * Is a native database datatype or a user-defined datatype?
   *
   * e.g. PostgreSQL enums are user-defined datatypes, but `int4` is a native datatype.
   */
  isNative: boolean;

  /**
   * Will be displayed as-is.
   */
  name: string;

  /**
   * Enum values for enum types.
   */
  options: string[];

  /**
   * The schema the datatype belongs to.
   */
  schema: string;
}

export type DataTypeGroup =
  | "string"
  | "datetime"
  | "boolean"
  | "enum"
  | "time"
  | "raw"
  | "numeric"
  | "json";

export interface AdapterQueryDetails {
  /**
   * Zero-based index of the page to fetch.
   */
  pageIndex: number;

  /**
   * Maximum number of rows to fetch from the database.
   */
  pageSize: number;

  /**
   * Sort order for the query.
   */
  sortOrder: SortOrderItem[];

  /**
   * The table to select from.
   */
  table: Table;

  /**
   * The filter to be applied.
   */
  filter?: FilterGroup;

  /**
   * Optional full-table content search term.
   *
   * This is interpreted by database-specific adapters and composed into the
   * generated SQL query.
   */
  fullTableSearchTerm?: string;
}

export type FilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "is"
  | "is not"
  | "like"
  | "not like"
  | "ilike"
  | "not ilike";

export interface ColumnFilter {
  kind: "ColumnFilter";
  column: string;
  operator: FilterOperator;
  value: unknown;
  after: "and" | "or";
  id: string;
}

export interface SqlFilter {
  kind: "SqlFilter";
  sql: string;
  after: "and" | "or";
  id: string;
}

export interface FilterGroup {
  kind: "FilterGroup";
  filters: (ColumnFilter | FilterGroup | SqlFilter)[];
  after: "and" | "or";
  id: string;
}

export interface SortOrderItem {
  /**
   * The column to sort by.
   */
  column: ColumnName;

  /**
   * The direction to sort the column by.
   */
  direction: SortDirection;
}

export type SortDirection = "asc" | "desc";

export class AdapterError extends Error {
  adapterSource?: string;
  query?: Query<unknown>;
}

export interface AdapterQueryResult {
  /**
   * The total number of rows the query would return if not limited.
   *
   * If the database does not support counting rows, this should be set to `Infinity`.
   */
  filteredRowCount: number | bigint | NumericString | BigIntString;

  /**
   * The rows returned by the query.
   */
  rows: Record<ColumnName, unknown>[];

  /**
   * The executed query string.
   */
  query: Query;
}

export interface AdapterRawDetails {
  sql: string;
}

export interface AdapterRawResult {
  rowCount: number;
  rows: Record<string, unknown>[];
  query: Query;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdapterSqlSchemaDetails {}

export interface AdapterSqlSchemaResult {
  defaultSchema?: string;
  dialect: SqlEditorDialect;
  namespace: Record<string, Record<string, string[]>>;
  version: string;
}

export interface AdapterSqlLintDetails {
  schemaVersion?: string;
  sql: string;
}

export interface AdapterSqlLintDiagnostic {
  code?: string;
  from: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
  to: number;
}

export interface AdapterSqlLintResult {
  diagnostics: AdapterSqlLintDiagnostic[];
  schemaVersion?: string;
}

export type SqlEditorDialect = "postgresql" | "mysql" | "sqlite";

export interface AdapterInsertDetails {
  /**
   * The table to insert into.
   */
  table: Table;

  /**
   * The values to insert into the table.
   * - The keys should match the column names in the table.
   * - The values should be the values to insert into the table.
   */
  rows: Record<string, unknown>[];
}

export interface AdapterInsertResult {
  /**
   * The freshly inserted row data.
   */
  rows: Record<string, unknown>[];

  /**
   * The executed query string.
   */
  query: Query<unknown>;
}

export interface AdapterUpdateDetails {
  /**
   * Changes to apply to the row.
   */
  changes: Record<ColumnName, unknown>;

  /**
   * The row to update.
   */
  row: Record<ColumnName, unknown>;

  /**
   * The table to update in.
   */
  table: Table;
}

export interface AdapterUpdateManyDetails {
  /**
   * The updates to apply to existing rows.
   */
  updates: AdapterUpdateDetails[];

  /**
   * The table to update in.
   */
  table: Table;
}

export interface AdapterUpdateResult {
  /**
   * The updated row data.
   */
  row: Record<ColumnName, unknown> & {
    /**
     * When the changes were applied in database time.
     */
    __ps_updated_at__: string | number | Date;
  };

  // TODO: turn this into a list.
  /**
   * The executed query string.
   */
  query: Query<unknown>;
}

export interface AdapterUpdateManyResult {
  /**
   * The updated row data in the same order as the requested updates.
   */
  rows: AdapterUpdateResult["row"][];

  /**
   * The executed queries that were run inside the transaction.
   */
  queries: Query<unknown>[];
}

export interface AdapterDeleteDetails {
  /**
   * The rows to delete.
   */
  rows: Record<ColumnName, unknown>[];

  /**
   * The table to delete from.
   */
  table: Table;
}

export interface AdapterDeleteResult {
  rows: Record<ColumnName, unknown>[];

  /**
   * The executed query string.
   */
  query: Query<unknown>;
}

export function createAdapterError(args: {
  adapterSource?: string;
  error: Error;
  query?: Query<unknown>;
}) {
  const { adapterSource, error, query } = args;

  const adapterError = error as AdapterError;

  adapterError.adapterSource = adapterSource;
  adapterError.query = query;

  return [adapterError] as [AdapterError];
}
