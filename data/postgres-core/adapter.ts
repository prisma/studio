import {
  type Adapter,
  type AdapterDeleteResult,
  type AdapterError,
  type AdapterInsertResult,
  type AdapterIntrospectResult,
  type AdapterQueryResult,
  type AdapterRawDetails,
  type AdapterRawResult,
  type AdapterRequirements,
  type AdapterSqlLintDetails,
  type AdapterSqlLintResult,
  type AdapterSqlSchemaResult,
  type AdapterUpdateDetails,
  type AdapterUpdateManyResult,
  type AdapterUpdateResult,
  type Column,
  createAdapterError,
  type FilterOperator,
  type Table,
} from "../adapter";
import {
  createFullTableSearchExecutionState,
  executeQueryWithFullTableSearchGuardrails,
} from "../full-table-search";
import {
  asQuery,
  type Query,
  QueryResult,
  withQueryVisibility,
} from "../query";
import { createSqlEditorSchemaFromIntrospection } from "../sql-editor-schema";
import type { Either } from "../type-utils";
import { POSTGRESQL_DATA_TYPES_TO_METADATA } from "./datatype";
import {
  getDeleteQuery,
  getInsertQuery,
  getSelectQuery,
  getUpdateQuery,
} from "./dml";
import {
  getTablesQuery,
  getTimezoneQuery,
  mockTablesQuery,
  mockTimezoneQuery,
} from "./introspection";
import {
  createLintDiagnosticsFromPostgresError,
  validateSqlForLint,
} from "./sql-lint";

export type PostgresAdapterRequirements = AdapterRequirements;

function markStudioSystemQuery<T>(query: Query<T>): Query<T> {
  return withQueryVisibility(query, "studio-system");
}

export function createPostgresAdapter(
  requirements: PostgresAdapterRequirements,
): Adapter {
  const { executor, ...otherRequirements } = requirements;
  const fullTableSearchState = createFullTableSearchExecutionState();
  let canUseExecutorLintTransport = typeof executor.lintSql === "function";
  const createPostgresAdapterError = (
    args: Parameters<typeof createAdapterError>[0],
  ) => createAdapterError({ ...args, adapterSource: "postgresql" });

  async function executeUpdateTransaction(
    updates: AdapterUpdateDetails[],
    options: Parameters<NonNullable<Adapter["update"]>>[1],
  ): Promise<Either<AdapterError, AdapterUpdateManyResult>> {
    const queries = updates.map((update) =>
      markStudioSystemQuery(getUpdateQuery(update, otherRequirements)),
    );

    try {
      if (typeof executor.executeTransaction === "function") {
        const [error, results] = await executor.executeTransaction(
          queries,
          options,
        );

        if (error) {
          return createPostgresAdapterError({ error, query: queries[0] });
        }

        const rows: AdapterUpdateResult["row"][] = [];

        for (const [index, result] of results.entries()) {
          const [row] = result;

          if (!row) {
            return createPostgresAdapterError({
              error: new Error("Update failed"),
              query: queries[index],
            });
          }

          rows.push(row as AdapterUpdateResult["row"]);
        }

        return [null, { rows, queries }];
      }

      const rows: AdapterUpdateResult["row"][] = [];

      for (const [index, query] of queries.entries()) {
        const [error, results] = await executor.execute(query, options);

        if (error) {
          return createPostgresAdapterError({ error, query });
        }

        const [row] = results;

        if (!row) {
          return createPostgresAdapterError({
            error: new Error("Update failed"),
            query: queries[index],
          });
        }

        rows.push(row as AdapterUpdateResult["row"]);
      }

      return [null, { rows, queries }];
    } catch (error: unknown) {
      return createPostgresAdapterError({ error: error as Error });
    }
  }

  async function introspectDatabase(
    options: Parameters<Adapter["introspect"]>[0],
  ): Promise<Either<AdapterError, AdapterIntrospectResult>> {
    try {
      const tablesQuery = getTablesQuery(otherRequirements);
      const timezoneQuery = getTimezoneQuery();
      const systemTablesQuery = markStudioSystemQuery(tablesQuery);
      const systemTimezoneQuery = markStudioSystemQuery(timezoneQuery);

      const [[tablesError, tables], [timezoneError, timezones]] =
        await Promise.all([
          executor.execute(systemTablesQuery, options),
          executor.execute(systemTimezoneQuery, options),
        ]);

      if (tablesError) {
        return createPostgresAdapterError({
          error: tablesError,
          query: systemTablesQuery,
        });
      }

      const timezone = timezoneError
        ? "UTC"
        : (timezones[0]?.timezone ?? "UTC");

      return [
        null,
        createIntrospection({ query: systemTablesQuery, tables, timezone }),
      ];
    } catch (error: unknown) {
      return createPostgresAdapterError({ error: error as Error });
    }
  }

  return {
    defaultSchema: "public",
    capabilities: {
      fullTableSearch: true,
      sqlDialect: "postgresql",
      sqlEditorAutocomplete: true,
      sqlEditorLint: true,
    },

    async introspect(
      options,
    ): Promise<Either<AdapterError, AdapterIntrospectResult>> {
      return await introspectDatabase(options);
    },

    async query(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterQueryResult>> {
      try {
        const query = markStudioSystemQuery(
          getSelectQuery(details, otherRequirements),
        );
        const [error, results] =
          await executeQueryWithFullTableSearchGuardrails({
            executor,
            options,
            query,
            searchTerm: details.fullTableSearchTerm,
            state: fullTableSearchState,
          });

        if (error) {
          return createPostgresAdapterError({ error, query });
        }

        return [
          null,
          {
            filteredRowCount: results[0]?.__ps_count__ || "0",
            rows: results,
            query,
          },
        ];
      } catch (error: unknown) {
        return createPostgresAdapterError({ error: error as Error });
      }
    },

    async raw(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterRawResult>> {
      return await executeRawQuery(executor, details, options);
    },

    async sqlSchema(
      _details,
      options,
    ): Promise<Either<AdapterError, AdapterSqlSchemaResult>> {
      const [error, introspection] = await introspectDatabase(options);

      if (error) {
        return [error];
      }

      return [
        null,
        createSqlEditorSchemaFromIntrospection({
          defaultSchema: "public",
          dialect: "postgresql",
          introspection,
        }),
      ];
    },

    async sqlLint(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterSqlLintResult>> {
      if (
        canUseExecutorLintTransport &&
        typeof executor.lintSql === "function"
      ) {
        try {
          const [error, result] = await executor.lintSql(details, options);

          if (!error) {
            return [null, result];
          }

          if (!shouldFallbackToExplainLint(error)) {
            return createPostgresAdapterError({ error });
          }

          if (shouldDisableLintTransport(error)) {
            canUseExecutorLintTransport = false;
          }
        } catch (error: unknown) {
          if (!shouldFallbackToExplainLint(error)) {
            return createPostgresAdapterError({ error: error as Error });
          }

          if (shouldDisableLintTransport(error)) {
            canUseExecutorLintTransport = false;
          }
        }
      }

      return await lintWithExplainFallback(executor, details, options);
    },

    async insert(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterInsertResult>> {
      try {
        const query = markStudioSystemQuery(
          getInsertQuery(details, otherRequirements),
        );

        const [error, rows] = await executor.execute(query, options);

        if (error) {
          return createPostgresAdapterError({ error, query });
        }

        return [null, { rows, query }];
      } catch (error: unknown) {
        return createPostgresAdapterError({ error: error as Error });
      }
    },

    async update(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterUpdateResult>> {
      try {
        const query = markStudioSystemQuery(
          getUpdateQuery(details, otherRequirements),
        );

        const [error, results] = await executor.execute(query, options);

        if (error) {
          return createPostgresAdapterError({ error, query });
        }

        const [row] = results;

        if (!row) {
          return createPostgresAdapterError({
            error: new Error("Update failed"),
            query,
          });
        }

        return [null, { row, query }];
      } catch (error: unknown) {
        return createPostgresAdapterError({ error: error as Error });
      }
    },

    async updateMany(details, options) {
      return await executeUpdateTransaction(details.updates, options);
    },

    async delete(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterDeleteResult>> {
      try {
        const query = markStudioSystemQuery(
          getDeleteQuery(details, otherRequirements),
        );

        const [error] = await executor.execute(query, options);

        if (error) {
          return createPostgresAdapterError({ error, query });
        }

        return [null, { ...details, query }];
      } catch (error: unknown) {
        return createPostgresAdapterError({ error: error as Error });
      }
    },
  };
}

function shouldFallbackToExplainLint(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("invalid procedure") ||
    message.includes("unexpected server error") ||
    message.includes("internal server error") ||
    message.includes("bad gateway") ||
    message.includes("service unavailable") ||
    message.includes("not supported") ||
    message.includes("method not allowed")
  );
}

function shouldDisableLintTransport(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("invalid procedure") ||
    message.includes("unexpected server error") ||
    message.includes("internal server error") ||
    message.includes("not supported") ||
    message.includes("method not allowed")
  );
}

async function lintWithExplainFallback(
  executor: AdapterRequirements["executor"],
  details: AdapterSqlLintDetails,
  options: Parameters<NonNullable<Adapter["sqlLint"]>>[1],
): Promise<Either<AdapterError, AdapterSqlLintResult>> {
  const validation = validateSqlForLint(details.sql);

  if (!validation.ok) {
    return [
      null,
      {
        diagnostics: [validation.diagnostic],
        schemaVersion: details.schemaVersion,
      },
    ];
  }

  const diagnostics: AdapterSqlLintResult["diagnostics"] = [];

  for (const statement of validation.statements) {
    try {
      const explainQuery = asQuery<Record<string, unknown>>(
        `EXPLAIN ${statement.statement}`,
      );
      const [error] = await executor.execute(
        markStudioSystemQuery(explainQuery),
        options,
      );

      if (!error) {
        continue;
      }

      diagnostics.push(
        ...createLintDiagnosticsFromPostgresError({
          error,
          positionOffset: statement.from,
          sql: statement.statement,
        }),
      );
    } catch (error: unknown) {
      diagnostics.push(
        ...createLintDiagnosticsFromPostgresError({
          error,
          positionOffset: statement.from,
          sql: statement.statement,
        }),
      );
    }
  }

  return [
    null,
    {
      diagnostics,
      schemaVersion: details.schemaVersion,
    },
  ];
}

async function executeRawQuery(
  executor: AdapterRequirements["executor"],
  details: AdapterRawDetails,
  options: Parameters<Adapter["raw"]>[1],
): Promise<Either<AdapterError, AdapterRawResult>> {
  try {
    const query = asQuery<Record<string, unknown>>(details.sql);
    const [error, rows] = await executor.execute(query, options);

    if (error) {
      return createAdapterError({
        adapterSource: "postgresql",
        error,
        query,
      });
    }

    return [
      null,
      {
        query,
        rowCount: rows.length,
        rows: rows,
      },
    ];
  } catch (error: unknown) {
    return createAdapterError({
      adapterSource: "postgresql",
      error: error as Error,
    });
  }
}

function createIntrospection(args: {
  query: Query;
  tables: QueryResult<typeof getTablesQuery>;
  timezone: string;
}): AdapterIntrospectResult {
  const { query, tables, timezone } = args;

  return tables.reduce(
    (result, table) => {
      const { schemas } = result;
      const { columns, name: tableName, schema } = table;

      const columnsRecord = columns.reduce(
        (columns, column) => {
          const {
            autoinc,
            computed,
            datatype,
            datatype_schema,
            default: defaultValue,
            name: columnName,
            options,
            nullable,
          } = column;

          const isArray = datatype.startsWith("_");
          const strippedDataType = isArray ? datatype.slice(1) : datatype;

          return {
            ...columns,
            [columnName]: {
              datatype: {
                ...(POSTGRESQL_DATA_TYPES_TO_METADATA[strippedDataType] || {
                  group: options.length > 0 ? "enum" : "raw",
                }),
                isArray,
                isNative: datatype_schema === "pg_catalog",
                name: isArray ? `${strippedDataType}[]` : strippedDataType,
                options,
                schema: datatype_schema,
              },
              defaultValue,
              fkColumn: column.fk_column,
              fkSchema: column.fk_schema,
              fkTable: column.fk_table,
              isAutoincrement: autoinc,
              isComputed: computed,
              isRequired:
                !nullable && !autoinc && !computed && defaultValue == null,
              name: columnName,
              nullable,
              pkPosition: column.pk,
              schema,
              table: tableName,
            } as const satisfies Column,
          };
        },
        {} as Table["columns"],
      );

      if (schemas[schema] === undefined) {
        schemas[schema] = { name: schema, tables: {} };
      }

      schemas[schema].tables[tableName] = {
        columns: columnsRecord,
        name: tableName,
        schema,
      };

      return result;
    },
    {
      filterOperators,
      query,
      schemas: { public: { name: "public", tables: {} } },
      timezone,
    } satisfies AdapterIntrospectResult as AdapterIntrospectResult,
  );
}

const filterOperators = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "is",
  "is not",
  "like",
  "not like",
  "ilike",
  "not ilike",
] satisfies FilterOperator[];

/**
 * For testing purposes.
 */
export function mockIntrospect() {
  const tables = mockTablesQuery();
  const [{ timezone }] = mockTimezoneQuery();
  const query = { parameters: [], sql: "<mocked>" } as Query;

  return createIntrospection({ tables, timezone, query }) as {
    // best effort, no need go overboard.
    schemas: {
      [K in (typeof tables)[number]["schema"]]: {
        name: K;
        tables: {
          [T in (typeof tables)[number]["name"]]: Table;
        };
      };
    };
    timezone: typeof timezone;
    filterOperators: FilterOperator[];
    query: Query;
  } satisfies AdapterIntrospectResult;
}
