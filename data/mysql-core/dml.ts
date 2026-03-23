import { type InferResult, type SimpleReferenceExpression, sql } from "kysely";
import type { OkPacketParams } from "mysql2";

import type {
  AdapterDeleteDetails,
  AdapterQueryDetails,
  AdapterUpdateDetails,
  Table,
} from "../adapter";
import {
  buildFullTableSearchPlan,
  FULL_TABLE_SEARCH_MYSQL_LOCK_WAIT_TIMEOUT_SECONDS,
  FULL_TABLE_SEARCH_TIMEOUT_MS,
  getFullTableSearchExpression,
  isFullTableSearchRequest,
} from "../full-table-search";
import {
  applyInferredRowFilters,
  applyTransformations,
  type BuilderRequirements,
  compile,
  getSelectFilterExpression,
} from "../query";
import type { BigIntString } from "../type-utils";
import { getMySQLBuilder } from "./builder";
import { mockTablesQuery } from "./introspection";

export function getDeleteQuery(
  details: AdapterDeleteDetails,
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const {
    rows,
    table: { columns, name: tableName },
  } = details;

  const builder =
    getMySQLBuilder<Record<string, Record<string, unknown>>>(requirements);

  return compile(
    builder
      .deleteFrom(tableName)
      .$call(applyInferredRowFilters(rows, columns))
      .$castTo<OkPacketParams>(),
  );
}

export function getInsertQuery(
  details: { rows: Record<string, unknown>[]; table: Table },
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const {
    rows,
    table: { columns, name: tableName },
  } = details;

  const builder =
    getMySQLBuilder<Record<string, Record<string, unknown>>>(requirements);

  return compile(
    builder
      .insertInto(tableName)
      .values(
        applyTransformations({
          columns,
          context: "insert",
          supportsDefaultKeyword: true,
          values: rows,
        }),
      )
      .$castTo<OkPacketParams>(),
  );
}

export function getInsertRefetchQuery(
  details: { criteria: Record<string, unknown>[]; table: Table },
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const {
    criteria,
    table: { columns, name: tableName },
  } = details;

  const builder =
    getMySQLBuilder<Record<string, Record<string, unknown>>>(requirements);

  return compile(
    builder
      .selectFrom(tableName)
      .$call(applyInferredRowFilters(criteria, columns))
      .select(Object.keys(columns))
      .select(getCurrentTimestampMillis().as("__ps_inserted_at__")),
  );
}

export function getUpdateRefetchQuery(
  details: AdapterUpdateDetails,
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const {
    changes,
    row,
    table: { columns, name: tableName },
  } = details;

  const builder =
    getMySQLBuilder<Record<string, Record<string, unknown>>>(requirements);

  return compile(
    builder
      .selectFrom(tableName)
      .$call(applyInferredRowFilters([{ ...row, ...changes }], columns))
      .select(Object.keys(columns))
      .select(getCurrentTimestampMillis().as("__ps_updated_at__")),
  );
}

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
    getMySQLBuilder<Record<string, Record<string, unknown>>>(requirements);

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
              dialect: "mysql",
            })(eb),
          ])
      : appliedFilterExpression;

  const AGG_NAME = "__ps_agg__";
  const COUNT_REF = "__ps_count__";
  const shouldApplySearchGuardrails =
    isFullTableSearchRequest(fullTableSearchTerm);
  const mysqlSearchOptimizerHint = sql`/*+ MAX_EXECUTION_TIME(${sql.lit(FULL_TABLE_SEARCH_TIMEOUT_MS)}) SET_VAR(lock_wait_timeout=${sql.lit(FULL_TABLE_SEARCH_MYSQL_LOCK_WAIT_TIMEOUT_SECONDS)}) */`;

  const countQuery = builder
    .selectFrom(tableName)
    .where(combinedWhereExpression)
    .select((eb) => {
      const countExpression = eb.cast<BigIntString>(
        eb.fn.coalesce(eb.fn.countAll(), sql.lit(0)),
        "char",
      );

      if (!shouldApplySearchGuardrails) {
        return countExpression.as(COUNT_REF);
      }

      return sql<BigIntString>`${mysqlSearchOptimizerHint} ${countExpression}`.as(
        COUNT_REF,
      );
    });

  return compile(
    builder
      .with(AGG_NAME, () => countQuery)
      .selectFrom(tableName)
      .innerJoin(AGG_NAME, (jb) => jb.onTrue())
      // TODO: cursor pagination?
      .where(combinedWhereExpression)
      .select(
        shouldApplySearchGuardrails
          ? sql<BigIntString>`${mysqlSearchOptimizerHint} ${sql.ref(
              `${AGG_NAME}.${COUNT_REF}`,
            )}`.as(COUNT_REF)
          : (`${AGG_NAME}.${COUNT_REF}` satisfies SimpleReferenceExpression<
              { [AGG_NAME]: InferResult<typeof countQuery>[number] },
              typeof AGG_NAME
            >),
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
      id: 1,
      created_at: new Date("2025-01-27T00:00:00.000Z"),
      deleted_at: null,
      role: "admin",
      name: "Alice",
      name_role: "Alice_admin",
      __ps_count__: "2",
    },
    {
      id: 2,
      created_at: new Date("2025-01-26T23:00:00.000Z"),
      deleted_at: null,
      role: "member",
      name: "Bob",
      name_role: "Bob_member",
      __ps_count__: "2",
    },
  ] as const satisfies {
    // best effort no need to go overboard
    [K in
      | ReturnType<typeof mockTablesQuery>[2]["columns"][number]["name"]
      | "__ps_count__"]: unknown;
  }[];
}

export function getUpdateQuery(
  details: AdapterUpdateDetails,
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
) {
  const {
    changes,
    row,
    table: { columns, name: tableName, schema },
  } = details;

  const builder =
    getMySQLBuilder<Record<string, Record<string, unknown>>>(requirements);

  return compile(
    builder
      .withSchema(schema)
      .updateTable(tableName)
      .set(
        applyTransformations({
          columns,
          context: "update",
          supportsDefaultKeyword: true,
          values: changes,
        }),
      )
      .$call(applyInferredRowFilters([row], columns))
      .$castTo<OkPacketParams>(),
  );
}

function getCurrentTimestampMillis() {
  return sql<number | string>`cast(unix_timestamp(now(3)) * 1000 as unsigned)`;
}
