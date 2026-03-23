import {
  type Adapter,
  type AdapterUpdateDetails,
  type AdapterDeleteResult,
  type AdapterError,
  type AdapterInsertResult,
  type AdapterIntrospectResult,
  type AdapterQueryResult,
  type AdapterRawResult,
  type AdapterRequirements,
  type AdapterSqlLintResult,
  type AdapterSqlSchemaResult,
  type AdapterUpdateManyResult,
  type AdapterUpdateResult,
  createAdapterError,
  type FilterOperator,
  type Table,
} from "../adapter";
import {
  createFullTableSearchExecutionState,
  executeQueryWithFullTableSearchGuardrails,
} from "../full-table-search";
import { asQuery, type Query, type QueryResult } from "../query";
import { createSqlEditorSchemaFromIntrospection } from "../sql-editor-schema";
import type { Either } from "../type-utils";
import {
  determineColumnAffinity,
  SQLITE_AFFINITY_TO_METADATA,
} from "./datatype";
import {
  getDeleteQuery,
  getInsertQuery,
  getSelectQuery,
  getUpdateQuery,
} from "./dml";
import { getTablesQuery, mockTablesQuery } from "./introspection";
import { lintSQLiteWithExplainFallback } from "./sql-lint";

export type SQLIteAdapterRequirements = AdapterRequirements;

const schema = "main";

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

export function createSQLiteAdapter(
  requirements: SQLIteAdapterRequirements,
): Adapter {
  const { executor, ...otherRequirements } = requirements;
  const fullTableSearchState = createFullTableSearchExecutionState();
  let canUseExecutorLintTransport = typeof executor.lintSql === "function";
  const createSQLiteAdapterError = (
    args: Parameters<typeof createAdapterError>[0],
  ) => createAdapterError({ ...args, adapterSource: "sqlite" });

  async function executeUpdateTransaction(
    updates: AdapterUpdateDetails[],
    options: Parameters<NonNullable<Adapter["update"]>>[1],
  ): Promise<Either<AdapterError, AdapterUpdateManyResult>> {
    const queries = updates.map((update) =>
      getUpdateQuery(update, otherRequirements),
    );

    try {
      if (typeof executor.executeTransaction === "function") {
        const [error, results] = await executor.executeTransaction(
          queries,
          options,
        );

        if (error) {
          return createSQLiteAdapterError({ error, query: queries[0] });
        }

        const rows: AdapterUpdateResult["row"][] = [];

        for (const [index, result] of results.entries()) {
          const [row] = result;

          if (!row) {
            return createSQLiteAdapterError({
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
          return createSQLiteAdapterError({ error, query });
        }

        const [row] = results;

        if (!row) {
          return createSQLiteAdapterError({
            error: new Error("Update failed"),
            query: queries[index],
          });
        }

        rows.push(row as AdapterUpdateResult["row"]);
      }

      return [null, { rows, queries }];
    } catch (error: unknown) {
      return createSQLiteAdapterError({ error: error as Error });
    }
  }

  async function introspectDatabase(
    options: Parameters<Adapter["introspect"]>[0],
  ): Promise<Either<AdapterError, AdapterIntrospectResult>> {
    try {
      const tablesQuery = getTablesQuery(requirements);

      const [tablesError, tables] = await executor.execute(
        tablesQuery,
        options,
      );

      if (tablesError) {
        return createSQLiteAdapterError({
          error: tablesError,
          query: tablesQuery,
        });
      }

      return [null, createIntrospection({ query: tablesQuery, tables })];
    } catch (error: unknown) {
      return createSQLiteAdapterError({ error: error as Error });
    }
  }

  return {
    defaultSchema: schema,
    capabilities: {
      fullTableSearch: true,
      sqlDialect: "sqlite",
      sqlEditorAutocomplete: true,
      sqlEditorLint: true,
    },

    async delete(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterDeleteResult>> {
      try {
        const query = getDeleteQuery(details, otherRequirements);

        // TODO: use results too.
        const [error] = await executor.execute(query, options);

        if (error) {
          return createSQLiteAdapterError({ error, query });
        }

        return [null, { ...details, query }];
      } catch (error: unknown) {
        return createSQLiteAdapterError({ error: error as Error });
      }
    },

    async insert(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterInsertResult>> {
      try {
        const query = getInsertQuery(details, otherRequirements);

        const [error, rows] = await executor.execute(query, options);

        if (error) {
          return createSQLiteAdapterError({ error, query });
        }

        return [null, { rows, query }];
      } catch (error: unknown) {
        return createSQLiteAdapterError({ error: error as Error });
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
          defaultSchema: schema,
          dialect: "sqlite",
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
            return createSQLiteAdapterError({ error });
          }

          canUseExecutorLintTransport = false;
        } catch (error: unknown) {
          if (!shouldFallbackToExplainLint(error)) {
            return createSQLiteAdapterError({ error: error as Error });
          }

          canUseExecutorLintTransport = false;
        }
      }

      return await lintSQLiteWithExplainFallback(executor, details, options);
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
          return createSQLiteAdapterError({ error, query });
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
        // TODO: handle properly
        return createSQLiteAdapterError({ error: error as Error });
      }
    },

    async raw(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterRawResult>> {
      try {
        const query = asQuery<Record<string, unknown>>(details.sql);
        const [error, rows] = await executor.execute(query, options);

        if (error) {
          return createSQLiteAdapterError({ error, query });
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
        return createSQLiteAdapterError({ error: error as Error });
      }
    },

    async update(
      details,
      options,
    ): Promise<Either<AdapterError, AdapterUpdateResult>> {
      try {
        const query = getUpdateQuery(details, otherRequirements);

        const [error, results] = await executor.execute(query, options);

        if (error) {
          return createSQLiteAdapterError({ error, query });
        }

        const [row] = results;

        if (!row) {
          // TODO: custom error?
          return createSQLiteAdapterError({
            error: new Error("Update failed"),
            query,
          });
        }

        return [null, { row, query }];
      } catch (error: unknown) {
        return createSQLiteAdapterError({ error: error as Error });
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
    message.includes("not supported") ||
    message.includes("method not allowed")
  );
}

const WITHOUT_ROWID_REGEX = /WITHOUT\s+ROWID/i;

function createIntrospection(args: {
  tables: QueryResult<typeof getTablesQuery>;
  query: Query;
}): AdapterIntrospectResult {
  const { tables, query: tablesQuery } = args;

  return {
    filterOperators,
    query: tablesQuery,
    schemas: tables.reduce(
      (schemas, table) => {
        const { columns, name: tableName, sql } = table;

        let maxPKSeen = 0;

        const columnsRecord = columns.reduce(
          (columnsRecord, column, index) => {
            const {
              datatype,
              default: defaultValue,
              fk_column,
              name: columnName,
              pk,
            } = column;

            maxPKSeen = Math.max(maxPKSeen, pk);

            const affinity = determineColumnAffinity(datatype);

            /**
             * `INTEGER PRIMARY KEY` columns act as `rowid` alias. `rowid` columns
             * are auto-generated unique numbers that exist in every SQLite table
             * unless a table is created using `WITHOUT ROWID` option.
             */
            const isRowId =
              datatype.toUpperCase() === "INTEGER" &&
              pk === 1 &&
              // no other primary key columns before this column.
              maxPKSeen === 1 &&
              !columns
                .slice(index + 1)
                .some(function isAlsoInPrimaryKey(column) {
                  return column.pk > 1;
                }) &&
              !WITHOUT_ROWID_REGEX.test(sql);

            const isComputed = Boolean(column.computed);
            // `rowid` columns are implicitly not nullable.
            const nullable = Boolean(column.nullable) && !isRowId;

            columnsRecord[columnName] = {
              datatype: {
                ...SQLITE_AFFINITY_TO_METADATA[affinity],
                affinity,
                isArray: false,
                isNative: true,
                name: datatype,
                // TODO: use `table.sql` to determine enum options from `check` constraints.
                options: [],
                schema,
              },
              defaultValue,
              fkColumn: fk_column,
              fkSchema: fk_column ? schema : null,
              fkTable: column.fk_table,
              // since `rowid` is auto generated unique number, and `AUTO INCREMENT`
              // can only be applied to such columns, we consider them autoincrement
              // and we don't need to check for the existence of the modifier in
              // the `CREATE TABLE` statement.
              isAutoincrement: isRowId,
              isComputed,
              isRequired:
                !nullable && !isRowId && !isComputed && defaultValue == null,
              name: columnName,
              nullable,
              pkPosition: pk > 0 ? pk : null,
              schema,
              table: tableName,
            };

            return columnsRecord;
          },
          {} as Table["columns"],
        );

        schemas.main!.tables[tableName] = {
          columns: columnsRecord,
          name: tableName,
          schema: "main",
        };

        return schemas;
      },
      {
        main: { tables: {}, name: "main" },
      } satisfies AdapterIntrospectResult["schemas"] as AdapterIntrospectResult["schemas"],
    ),
    timezone: "UTC",
  };
}

/**
 * For testing purposes.
 */
export function mockIntrospect() {
  const query = { parameters: [], sql: "<mocked>" } as Query;
  const tables = mockTablesQuery();

  return createIntrospection({ query, tables }) as {
    // best effort, no need go overboard.
    schemas: {
      main: {
        name: "main";
        tables: {
          [T in (typeof tables)[number]["name"]]: Table;
        };
      };
    };
    timezone: string;
    filterOperators: FilterOperator[];
    query: Query;
  } satisfies AdapterIntrospectResult;
}
