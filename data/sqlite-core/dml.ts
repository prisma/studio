import { expressionBuilder, type InferResult, sql } from "kysely";
import { SimpleReferenceExpression } from "kysely";

import type {
  AdapterDeleteDetails,
  AdapterInsertDetails,
  AdapterQueryDetails,
  AdapterUpdateDetails,
} from "../adapter";
import {
  buildFullTableSearchPlan,
  getFullTableSearchExpression,
} from "../full-table-search";
import {
  applyInferredRowFilters,
  applyTransformations,
  type BuilderRequirements,
  compile,
  getSelectFilterExpression,
} from "../query";
import type { BigIntString } from "../type-utils";
import { getSQLiteBuilder } from "./builder";
import { mockTablesQuery } from "./introspection";

/**
 * Returns a query that selects all columns from a table with an unbound row count as `__ps_count__`.
 */
export function getSelectQuery(
  details: AdapterQueryDetails,
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const {
    filter = { after: "and", filters: [], kind: "FilterGroup" },
    fullTableSearchTerm,
    pageIndex,
    pageSize,
    sortOrder,
    table: { columns, name: tableName },
  } = details;

  const builder =
    getSQLiteBuilder<Record<string, Record<string, unknown>>>(requirements);

  const appliedFilterExpression = getSelectFilterExpression(
    filter.filters,
    columns,
  );
  const fullTableSearchPlan = buildFullTableSearchPlan({
    searchTerm: fullTableSearchTerm,
    table: details.table,
  });
  const combinedWhereExpression =
    fullTableSearchPlan.predicates.length > 0
      ? (eb: Parameters<ReturnType<typeof getSelectFilterExpression>>[0]) =>
          eb.and([
            appliedFilterExpression(eb),
            getFullTableSearchExpression(fullTableSearchPlan, {
              dialect: "sqlite",
            })(eb),
          ])
      : appliedFilterExpression;

  const AGG_NAME = "__ps_agg__";
  const COUNT_REF = "__ps_count__";

  const countQuery = builder
    .selectFrom(tableName)
    .where(combinedWhereExpression)
    .select((eb) =>
      eb
        .cast<BigIntString>(
          eb.fn.coalesce(eb.fn.countAll(), sql.lit(0)),
          "text",
        )
        .as(COUNT_REF),
    );

  return compile(
    builder
      .with(AGG_NAME, () => countQuery)
      .selectFrom(tableName)
      .innerJoin(AGG_NAME, (jb) => jb.onTrue())
      // TODO: cursor pagination?
      .where(combinedWhereExpression)
      .select(
        `${AGG_NAME}.${COUNT_REF}` satisfies SimpleReferenceExpression<
          { [AGG_NAME]: InferResult<typeof countQuery>[number] },
          typeof AGG_NAME
        >,
      )
      .select(Object.keys(columns))
      .$call((qb) =>
        sortOrder.reduce(
          (qb, item) => qb.orderBy(item.column, item.direction),
          qb,
        ),
      )
      .limit(pageSize)
      // we're injecting the offset value here to avoid serialization complexity (`bigint` is a no-go for `JSON.stringify`).
      .offset(sql.lit(BigInt(pageIndex) * BigInt(pageSize))),
  );
}

/**
 * For testing purposes.
 */
export function mockSelectQuery() {
  return [
    {
      created_at: new Date("2025-01-26T21:56:12.345Z"),
      deleted_at: null,
      id: 1,
      name: "John Doe",
      __ps_count__: "2",
      role: "admin",
      name_role: "Jonn Doe - admin",
    },
    {
      created_at: new Date("2025-01-26T20:56:12.345Z"),
      deleted_at: null,
      id: 2,
      name: "Jane Doe",
      __ps_count__: "2",
      role: "poweruser",
      name_role: "Jane Doe - poweruser",
    },
  ] as const satisfies {
    // best effort no need to go overboard
    [K in
      | ReturnType<typeof mockTablesQuery>[1]["columns"][number]["name"]
      | "__ps_count__"]: unknown;
  }[];
}

/**
 * Returns a query that deletes a given set of rows.
 */
export function getDeleteQuery(
  details: AdapterDeleteDetails,
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const {
    rows,
    table: { columns, name: tableName },
  } = details;

  const builder =
    getSQLiteBuilder<Record<string, Record<string, unknown>>>(requirements);

  return compile(
    builder
      .deleteFrom(tableName)
      .$call(applyInferredRowFilters(rows, columns))
      .returning(Object.keys(columns))
      .returning(getCurrentTimestampMillis().as("__ps_deleted_at__")),
  );
}

/**
 * Inserts one or more rows into a table and returns the inserted rows along with their `ctid`.
 */
export function getInsertQuery(
  details: AdapterInsertDetails,
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const {
    table: { columns, name: tableName },
    rows,
  } = details;

  const builder =
    getSQLiteBuilder<Record<string, Record<string, unknown>>>(requirements);

  return compile(
    builder
      .insertInto(tableName)
      .values(
        applyTransformations({
          columns,
          context: "insert",
          supportsDefaultKeyword: false,
          values: rows,
        }),
      )
      .returning(Object.keys(columns))
      .returning(getCurrentTimestampMillis().as("__ps_inserted_at__")),
  );
}

/**
 * Returns a query that updates a given row in a table with given changes.
 */
export function getUpdateQuery(
  details: AdapterUpdateDetails,
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const {
    changes,
    row,
    table: { columns, name: tableName },
  } = details;

  const builder =
    getSQLiteBuilder<Record<string, Record<string, unknown>>>(requirements);

  return compile(
    builder
      .updateTable(tableName)
      .set(
        applyTransformations({
          columns,
          context: "update",
          supportsDefaultKeyword: false,
          values: changes,
        }),
      )
      .$call(applyInferredRowFilters([row], columns))
      .returning(Object.keys(columns))
      .returning(getCurrentTimestampMillis().as("__ps_updated_at__")),
  );
}

function getCurrentTimestampMillis() {
  const eb = expressionBuilder();

  return eb.cast<BigIntString>(
    eb.cast(sql`(julianday('now') - 2440587.5) * 86400000.0`, "integer"),
    "text",
  );
}
