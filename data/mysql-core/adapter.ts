import {
  type Adapter,
  type AdapterDeleteResult,
  type AdapterError,
  type AdapterInsertResult,
  type AdapterIntrospectResult,
  type AdapterQueryResult,
  type AdapterRawResult,
  type AdapterRequirements,
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
import type { SequenceExecutor } from "../executor";
import {
  createFullTableSearchExecutionState,
  executeQueryWithFullTableSearchGuardrails,
} from "../full-table-search";
import {
  asQuery,
  inferFilterObject,
  type Query,
  type QueryResult,
} from "../query";
import { createSqlEditorSchemaFromIntrospection } from "../sql-editor-schema";
import type { Either } from "../type-utils";
import { MYSQL_DATA_TYPES_TO_METADATA } from "./datatype";
import {
  getDeleteQuery,
  getInsertQuery,
  getInsertRefetchQuery,
  getSelectQuery,
  getUpdateQuery,
  getUpdateRefetchQuery,
} from "./dml";
import {
  getTablesQuery,
  getTimezoneQuery,
  mockTablesQuery,
  mockTimezoneQuery,
} from "./introspection";
import { lintMySQLWithExplainFallback } from "./sql-lint";

export type MySQLAdapterRequirements = Omit<AdapterRequirements, "executor"> & {
  executor: SequenceExecutor;
};

export function createMySQLAdapter(
  requirements: MySQLAdapterRequirements,
): Adapter {
  const { executor, ...otherRequirements } = requirements;
  const fullTableSearchState = createFullTableSearchExecutionState();
  let canUseExecutorLintTransport = typeof executor.lintSql === "function";
  const createMySQLAdapterError = (
    args: Parameters<typeof createAdapterError>[0],
  ) => createAdapterError({ ...args, adapterSource: "mysql" });

  async function executeUpdateTransaction(
    updates: AdapterUpdateDetails[],
    options: Parameters<NonNullable<Adapter["update"]>>[1],
  ): Promise<Either<AdapterError, AdapterUpdateManyResult>> {
    const updateQueries = updates.map((update) =>
      getUpdateQuery(update, otherRequirements),
    );
    const refetchQueries = updates.map((update) =>
      getUpdateRefetchQuery(update, otherRequirements),
    );
    const queries = updateQueries.flatMap((query, index) => [
      query,
      refetchQueries[index]!,
    ]);

    try {
      if (typeof executor.executeTransaction === "function") {
        const [error, results] = await executor.executeTransaction(
          queries,
          options,
        );

        if (error) {
          return createMySQLAdapterError({ error, query: updateQueries[0] });
        }

        const rows: AdapterUpdateResult["row"][] = [];

        for (let index = 0; index < updates.length; index += 1) {
          const refetchResult = results[index * 2 + 1];
          const [row] = refetchResult ?? [];

          if (!row) {
            return createMySQLAdapterError({
              error: new Error("Updated row not found"),
              query: updateQueries[index],
            });
          }

          rows.push(row as AdapterUpdateResult["row"]);
        }

        return [null, { rows, queries: updateQueries }];
      }

      const rows: AdapterUpdateResult["row"][] = [];

      for (let index = 0; index < updates.length; index += 1) {
        const [[updateError], refetchResult] = await executor.executeSequence(
          [updateQueries[index]!, refetchQueries[index]!],
          options,
        );

        if (updateError) {
          return createMySQLAdapterError({
            error: updateError,
            query: updateQueries[index],
          });
        }

        const [refetchError, refetchRows] = refetchResult!;

        if (refetchError) {
          return createMySQLAdapterError({
            error: refetchError,
            query: updateQueries[index],
          });
        }

        const [row] = refetchRows;

        if (!row) {
          return createMySQLAdapterError({
            error: new Error("Updated row not found"),
            query: updateQueries[index],
          });
        }

        rows.push(row as AdapterUpdateResult["row"]);
      }

      return [null, { rows, queries: updateQueries }];
    } catch (error: unknown) {
      return createMySQLAdapterError({ error: error as Error });
    }
  }

  async function introspectDatabase(
    options: Parameters<Adapter["introspect"]>[0],
  ): Promise<Either<AdapterError, AdapterIntrospectResult>> {
    try {
      const tablesQuery = getTablesQuery(requirements);
      const timezoneQuery = getTimezoneQuery(requirements);

      const [[tablesError, tables], [timezoneError, timezones]] =
        await Promise.all([
          executor.execute(tablesQuery, options),
          executor.execute(timezoneQuery, options),
        ]);

      if (tablesError) {
        return createMySQLAdapterError({
          error: tablesError,
          query: tablesQuery,
        });
      }

      const timezone = timezoneError
        ? "UTC"
        : (timezones[0]?.timezone ?? "UTC");

      return [
        null,
        createIntrospection({ query: tablesQuery, tables, timezone }),
      ];
    } catch (error: unknown) {
      return createMySQLAdapterError({ error: error as Error });
    }
  }

  return {
    capabilities: {
      fullTableSearch: true,
      sqlDialect: "mysql",
      sqlEditorAutocomplete: true,
      sqlEditorLint: true,
    },

    async delete(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterDeleteResult>> {
      try {
        const query = getDeleteQuery(details, otherRequirements);

        const [error] = await executor.execute(query, options);

        if (error) {
          return createMySQLAdapterError({ error, query });
        }

        return [null, { ...details, query }];
      } catch (error: unknown) {
        return createMySQLAdapterError({ error: error as Error });
      }
    },

    async insert(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterInsertResult>> {
      try {
        const { rows, table } = details;
        const { columns } = table;

        const autoincrementColumn: Column | undefined = Object.values(
          columns,
        ).find((column) => column.isAutoincrement);

        const filterObjects = rows.map((row) =>
          inferFilterObject(row, columns),
        );

        const hasPartialFilterObjects = filterObjects.some((filterObject) => {
          const filterValues = Object.values(filterObject);

          return (
            filterValues.length === 0 ||
            filterValues.some((value) => value == null)
          );
        });

        // TODO: handle classic partial filter object cases (e.g. uuid) here or before requesting from adapter.
        if (!autoincrementColumn && hasPartialFilterObjects) {
          return createMySQLAdapterError({
            error: new Error(
              "Cannot proceed with the insertion, some rows cannot be refetched after insertion.",
            ),
            query: getInsertQuery(details, otherRequirements),
          });
        }

        if (!hasPartialFilterObjects) {
          const insertQuery = getInsertQuery(details, otherRequirements);
          const refetchQuery = getInsertRefetchQuery(
            { criteria: filterObjects, table },
            otherRequirements,
          );
          const sequence = [insertQuery, refetchQuery] as const;

          const [[insertError], maybeRefetchResult] =
            await executor.executeSequence(sequence, options);

          const query = joinSequence(sequence);

          if (insertError) {
            return createMySQLAdapterError({ error: insertError, query });
          }

          const [refetchError, refetchResults] = maybeRefetchResult!;

          if (refetchError) {
            return createMySQLAdapterError({
              error: new Error(
                "Failed to refetch inserted rows - please refresh.",
                { cause: refetchError },
              ),
              query,
            });
          }

          return [null, { rows: refetchResults, query }];
        }

        // has autoincrement column - insert rows one by one and refetch, taking advantage of `insertId` if inserted row has no value for this column.
        const results = await Promise.all(
          rows.map(async (row) => {
            const insertQuery = getInsertQuery(
              { rows: [row], table },
              otherRequirements,
            );

            const [error, result] = await executor.execute(
              insertQuery,
              options,
            );

            if (error) {
              return createMySQLAdapterError({ error, query: insertQuery });
            }

            const { name: autoincrementColumnName } = autoincrementColumn!;

            const value = row[autoincrementColumnName] || result[0]?.insertId;

            if (!value) {
              return createMySQLAdapterError({
                error: new Error(
                  "Could not determine value for autoincrement column to refetch inserted row.",
                ),
                query: insertQuery,
              });
            }

            const refetchQuery = getInsertRefetchQuery(
              {
                criteria: [{ [autoincrementColumnName]: value }],
                table: {
                  ...table,
                  // FIXME: dirty hack to mark autoincrement column as THE primary key for refetching.
                  columns: Object.values(columns).reduce(
                    (acc, column) => {
                      const { name: columnName } = column;

                      acc[columnName] = {
                        ...column,
                        pkPosition:
                          columnName === autoincrementColumnName ? 1 : null,
                      };

                      return acc;
                    },
                    {} as Table["columns"],
                  ),
                },
              },
              otherRequirements,
            );

            const [refetchError, refetchResults] = await executor.execute(
              refetchQuery,
              options,
            );

            const query = joinSequence([insertQuery, refetchQuery]);

            if (refetchError) {
              console.error("Error refetching inserted row:", refetchError);

              return createMySQLAdapterError({
                error: new Error(
                  "Failed to refetch inserted row - please refresh.",
                  { cause: refetchError },
                ),
                query,
              });
            }

            const [refetchedRow] = refetchResults;

            if (!refetchedRow) {
              return createMySQLAdapterError({
                error: new Error(
                  "Refetch query returned no results for inserted row.",
                ),
                query,
              });
            }

            return [null, { row: refetchedRow, query }] as const;
          }),
        );

        const insertedRows: Record<string, unknown>[] = [];
        let query: Query<unknown> | null = null;
        const errors: [number, AdapterError][] = [];

        for (let i = 0; i < results.length; i++) {
          const [error, result] = results[i]!;

          if (error) {
            errors.push([i, error]);

            if (error.query) {
              query = !query ? error.query : joinSequence([query, error.query]);
            }
          } else {
            insertedRows.push(result.row);

            if (result.query) {
              query = !query
                ? result.query
                : joinSequence([query, result.query]);
            }
          }
        }

        if (errors.length > 0) {
          return createMySQLAdapterError({
            error: new AggregateError(
              errors.map(([, error]) => error),
              `Row${errors.length > 1 ? "s" : ""} ${errors.map(([index]) => index).join(", ")} could not be inserted or refetched.`,
            ),
            query: query!,
          });
        }

        return [null, { rows: insertedRows, query: query! }];
      } catch (error: unknown) {
        return createMySQLAdapterError({ error: error as Error });
      }
    },

    async introspect(
      options,
    ): Promise<Either<AdapterError, AdapterIntrospectResult>> {
      return await introspectDatabase(options);
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
          defaultSchema: undefined,
          dialect: "mysql",
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
            return createMySQLAdapterError({ error });
          }

          canUseExecutorLintTransport = false;
        } catch (error: unknown) {
          if (!shouldFallbackToExplainLint(error)) {
            return createMySQLAdapterError({ error: error as Error });
          }

          canUseExecutorLintTransport = false;
        }
      }

      return await lintMySQLWithExplainFallback(executor, details, options);
    },

    async raw(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterRawResult>> {
      try {
        const query = asQuery<Record<string, unknown>>(details.sql);
        const [error, rows] = await executor.execute(query, options);

        if (error) {
          return createMySQLAdapterError({ error, query });
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
        return createMySQLAdapterError({ error: error as Error });
      }
    },

    async query(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterQueryResult>> {
      try {
        const query = getSelectQuery(details, otherRequirements);
        const [error, results] =
          await executeQueryWithFullTableSearchGuardrails({
            executor,
            options,
            query,
            searchTerm: details.fullTableSearchTerm,
            state: fullTableSearchState,
          });

        if (error) {
          return createMySQLAdapterError({ error, query });
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
        return createMySQLAdapterError({ error: error as Error });
      }
    },

    async update(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterUpdateResult>> {
      try {
        const updateQuery = getUpdateQuery(details, otherRequirements);
        const refetchQuery = getUpdateRefetchQuery(details, otherRequirements);

        const [[updateError], refetchResult] = await executor.executeSequence(
          [updateQuery, refetchQuery],
          options,
        );

        if (updateError) {
          return createMySQLAdapterError({
            error: updateError,
            query: updateQuery,
          });
        }

        const [refetchError, results] = refetchResult!;

        if (refetchError) {
          return createMySQLAdapterError({
            error: refetchError,
            query: updateQuery,
          });
        }

        const [row] = results;

        if (!row) {
          return createMySQLAdapterError({
            error: new Error("Updated row not found"),
            query: updateQuery,
          });
        }

        return [null, { row, query: updateQuery }];
      } catch (error: unknown) {
        return createMySQLAdapterError({ error: error as Error });
      }
    },

    async updateMany(details, options) {
      return await executeUpdateTransaction(details.updates, options);
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

      const columnsRecord = normalizeColumns(columns)
        .sort((a, b) => a.position - b.position)
        .reduce(
          (columns, column) => {
            const {
              datatype,
              default: defaultValue,
              name: columnName,
            } = column;

            const indexOfParenthesis = datatype.indexOf("(");
            const strippedDataType = (
              indexOfParenthesis > -1
                ? datatype.substring(0, indexOfParenthesis)
                : datatype
            )
              .trim()
              .toLowerCase();

            const isAutoincrement = Boolean(column.autoincrement);
            const isComputed = Boolean(column.computed);
            const nullable = Boolean(column.nullable);

            return {
              ...columns,
              [columnName]: {
                datatype: {
                  ...(MYSQL_DATA_TYPES_TO_METADATA[strippedDataType] || {
                    group: "raw",
                  }),
                  isArray: false,
                  isNative: true,
                  name: strippedDataType,
                  options:
                    strippedDataType === "enum"
                      ? datatype
                          .slice(`enum('`.length, -`')`.length)
                          .split(`','`)
                      : [],
                  schema,
                },
                defaultValue,
                fkColumn: column.fk_column,
                fkSchema: schema,
                fkTable: column.fk_table,
                isAutoincrement,
                isComputed,
                isRequired:
                  !nullable &&
                  !isAutoincrement &&
                  !isComputed &&
                  defaultValue == null,
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
      schemas: {},
      timezone,
    } satisfies AdapterIntrospectResult as AdapterIntrospectResult,
  );
}

function normalizeColumns(
  columns: QueryResult<typeof getTablesQuery>[number]["columns"],
): QueryResult<typeof getTablesQuery>[number]["columns"] {
  if (Array.isArray(columns)) {
    return columns;
  }

  if (typeof columns === "string") {
    const parsedColumns: unknown = JSON.parse(columns);

    if (Array.isArray(parsedColumns)) {
      return parsedColumns as QueryResult<
        typeof getTablesQuery
      >[number]["columns"];
    }
  }

  throw new TypeError("Expected MySQL introspection columns to be an array");
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

function joinSequence(
  sequence: readonly [Query<unknown>, Query<unknown>],
): Query<unknown> {
  const [query0, query1] = sequence;

  return {
    parameters: query0.parameters.concat(query1.parameters),
    sql: `${query0.sql};\n${query1.sql}`,
  };
}
