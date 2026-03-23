import type { Database, SqlValue } from "sql.js";

import type { Executor } from "../executor";
import type { Query } from "../query";

export function createSQLJSExecutor(database: Database): Executor {
  function executeQuery(query: Query<unknown>) {
    const { parameters, sql, transformations } = query;

    const statement = database.prepare(sql);
    statement.bind(parameters as SqlValue[]);

    const rows = [];

    while (statement.step()) {
      const row = statement.getAsObject();

      rows.push(row);
    }

    if (!transformations || Object.keys(transformations).length === 0) {
      return rows;
    }

    const typedTransformations = transformations as Record<
      string,
      "json-parse" | undefined
    >;

    for (const row of rows) {
      for (const column in typedTransformations) {
        const transformation = typedTransformations[column];
        const value = row[column];

        if (transformation === "json-parse") {
          if (typeof value === "string") {
            try {
              row[column] = JSON.parse(value) as never;
            } catch (error) {
              console.error(
                `Failed to JSON.parse column "${column}" with value: ${value}`,
                error,
              );
            }
          }

          continue;
        }

        transformation satisfies undefined;
      }
    }

    return rows;
  }

  return {
    execute: (query) => {
      try {
        return Promise.resolve([null, executeQuery(query)]) as never;
      } catch (error: unknown) {
        return Promise.resolve([error as Error]);
      }
    },

    executeTransaction: (queries) => {
      try {
        database.run("BEGIN");
        const results = queries.map((query) => executeQuery(query));
        database.run("COMMIT");

        return Promise.resolve([null, results]) as never;
      } catch (error: unknown) {
        try {
          database.run("ROLLBACK");
        } catch {
          // no-op
        }

        return Promise.resolve([error as Error]);
      }
    },
  };
}
