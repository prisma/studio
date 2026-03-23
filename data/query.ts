import {
  type Compilable,
  type DialectAdapter,
  DummyDriver,
  type Expression,
  type ExpressionBuilder,
  expressionBuilder,
  type ExpressionWrapper,
  type InsertObject,
  Kysely,
  type KyselyPlugin,
  OperationNodeTransformer,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type PrimitiveValueListNode,
  type QueryCompiler,
  type QueryResult as KyselyQueryResult,
  type RootOperationNode,
  sql,
  type SqlBool,
  type UnknownRow,
  type UpdateObject,
  ValueListNode,
  ValueNode,
  type WhereInterface,
} from "kysely";

import { normalizeSqlWhereClause } from "../lib/sql-filter";
import type {
  Column,
  ColumnFilter,
  FilterGroup,
  SqlFilter,
  Table,
} from "./adapter";
import {
  DEFAULT_BOOLEAN,
  DEFAULT_JSON,
  DEFAULT_NUMERIC,
  DEFAULT_STRING,
  getDate0,
} from "./defaults";

export interface BuilderRequirements {
  Adapter: { new (): DialectAdapter };
  noParameters?: boolean;
  QueryCompiler: { new (): QueryCompiler };
}

export function getBuilder<DB>(requirements: BuilderRequirements): Kysely<DB> {
  return new Kysely({
    dialect: {
      createAdapter: () => new requirements.Adapter(),
      createDriver: () => new DummyDriver(),
      // @ts-expect-error - we don't need built-in introspection in this case
      createIntrospector: () => null,
      createQueryCompiler: () => new requirements.QueryCompiler(),
    },
    plugins: [
      ...(requirements.noParameters ? [new ImmediateValuePlugin()] : []),
    ],
  });
}

/**
 * A plugin that transforms all values to immediate values. This means their injected into the SQL string instead of populating the parameters array.
 * In some situations, a database driver might not support parameters, and this plugin can be used to work around that.
 */
class ImmediateValuePlugin implements KyselyPlugin {
  readonly #transformer = new ImmediateValueTransformer();

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return this.#transformer.transformNode(args.node);
  }

  transformResult(
    args: PluginTransformResultArgs,
  ): Promise<KyselyQueryResult<UnknownRow>> {
    return Promise.resolve(args.result);
  }
}

class ImmediateValueTransformer extends OperationNodeTransformer {
  protected override transformPrimitiveValueList(
    node: PrimitiveValueListNode,
  ): PrimitiveValueListNode {
    return ValueListNode.create(
      node.values.map(ValueNode.createImmediate),
    ) as never;
  }

  override transformValue(node: ValueNode): ValueNode {
    return { ...super.transformValue(node), immediate: true };
  }
}

declare const queryType: unique symbol;
export interface Query<T = Record<string, unknown>> {
  [queryType]?: T;
  parameters: readonly unknown[];
  sql: string;
  transformations?: Partial<Record<keyof T, "json-parse">>;
}

export function asQuery<T>(query: string | Query<unknown>): Query<T> {
  if (typeof query === "string") {
    return { parameters: [], sql: query } as never;
  }

  return query as never;
}

export type QueryResult<T> =
  T extends Query<infer R>
    ? R[]
    : T extends (...args: any[]) => Query<infer R>
      ? R[]
      : never;

export interface CompileOptions<T> {
  /**
   * A mapping of column names to transformations that should be applied to the result.
   * Currently supported transformation is "json-parse", which parses a JSON string into an object.
   */
  transformations?: Partial<Record<keyof T, "json-parse">>;
}

export function compile<T = Record<string, unknown>>(
  compileable: Compilable<T>,
  options?: CompileOptions<T>,
): Query<T> {
  const compiledQuery = compileable.compile();

  return {
    parameters: compiledQuery.parameters,
    sql: compiledQuery.sql,
    transformations: options?.transformations,
  };
}

/**
 * Applies a filter to the given rows based on the primary key columns of the table.
 *
 * @example db.selectFrom("users").$call(applyInferredRowFilters(rows, columns)).selectAll()
 */
export function applyInferredRowFilters(
  rows: Record<string, unknown>[],
  columns: Table["columns"],
) {
  const rowFilters = inferRowFilters(rows, columns);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <QB extends WhereInterface<any, any>>(qb: QB): QB =>
    qb.where((eb) => {
      return eb.or(
        rowFilters.map((rowFilter) => {
          return eb.and(
            rowFilter.map(([columnName, value]) =>
              eb(
                columnName,
                value === null ? "is" : Array.isArray(value) ? "in" : "=",
                value,
              ),
            ),
          );
        }),
      );
    }) as never;
}

/**
 * Part of a filter that predicts a match.
 * ie. ... WHERE $ColumName = $Value ...
 */

type RowFilterPredicate = [
  ColumnName: string | Expression<any>,
  Value: unknown,
];

/**
 * A row filter is comprised of one or more predicates.
 */
type RowFilter = RowFilterPredicate[];

/**
 * Row filters is simply a set of multiple {@link RowFilter}.
 */
type RowFilters = RowFilter[];

/**
 * Infers the filter that is necessary to uniquely identify a given row
 * individually.
 */
export function inferFilterObject(
  row: Record<string, unknown>,
  columns: Table["columns"],
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  for (const column of Object.values(columns)) {
    const { name: columnName, pkPosition } = column;

    if (pkPosition == null) {
      continue;
    }

    filter[columnName] = row[columnName] ?? null;
  }

  return filter;
}

/**
 * Infers the filter that is necessary to uniquely identify multiple rows
 * individually.
 *
 * Elegantly infers the best possible statement to filter with.
 * TODO: if we ever support MSSQL, we'll need to drop to dumb (... and ...) or (... and ...) like in the old way just for MSSQL.
 *
 * For single column primary key:
 *
 * 1. if only 1 row: col = value
 * 2. if multiple rows: col IN (value1, value2, ...)
 *
 * For composite primary key:
 *
 * 1. if only 1 row: (col1, col2, ...) = (value1, value2, ...)
 * 2. if multiple rows: (col1, col2, ...) IN ((value1a, value2a, ...), (value1b, value2b, ...), ...)
 */
export function inferRowFilters(
  rows: Record<string, unknown>[],
  columns: Table["columns"],
): RowFilters {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refs: ExpressionWrapper<any, any, any>[] = [];
  const values: unknown[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eb = expressionBuilder<any, any>();

  for (const row of rows) {
    const valuesForRow: unknown[] = [];

    for (const column of Object.values(columns)) {
      const { name: columnName, pkPosition } = column;

      if (pkPosition == null) {
        continue;
      }

      const pkIndex = pkPosition - 1;

      if (row === rows.at(0)) {
        refs[pkIndex] = eb.ref(columnName);
      }

      valuesForRow[pkIndex] = transformValue(row[columnName] ?? null, column);
    }

    values.push(
      refs.length === 1 ? valuesForRow.at(0)! : tupleFrom(valuesForRow),
    );
  }

  const lhs = refs.length === 1 ? refs.at(0)! : tupleFrom(refs);
  const rhs = values.length === 1 ? values.at(0)! : values;

  return [[[lhs, rhs]]];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tupleFrom(items: unknown[]): Expression<any> {
  return sql`(${sql.join(items, sql`, `)})`;
}

export interface ApplyWriteTransformationsProps<C extends "insert" | "update"> {
  columns: Table["columns"];
  context: C;
  values: C extends "update"
    ? Record<string, unknown>
    : Record<string, unknown> | Record<string, unknown>[];
  supportsDefaultKeyword: boolean;
}

export function applyTransformations<C extends "insert" | "update">(
  props: ApplyWriteTransformationsProps<C>,
): C extends "update"
  ? () => UpdateObject<any, any>
  : () => InsertObject<any, any> | InsertObject<any, any>[] {
  const { values } = props;

  return () =>
    Array.isArray(values)
      ? values.map((row) => transformValues({ ...props, values: row }))
      : transformValues({ ...props, values });
}

interface TransformValuesProps {
  columns: Table["columns"];
  context: "insert" | "update";
  supportsDefaultKeyword: boolean;
  values: Record<string, unknown>;
}

function transformValues(
  props: TransformValuesProps,
): InsertObject<unknown, never> | UpdateObject<unknown, never> {
  const { columns, context, supportsDefaultKeyword, values } = props;

  const valueEntries = Object.entries(values);

  const requiredColumns =
    context === "update"
      ? []
      : Object.values(columns).filter((col) => col.isRequired);

  if (
    context === "insert" &&
    valueEntries.length === 0 &&
    requiredColumns.length === 0
  ) {
    return {
      [Object.keys(columns).at(0)!]: supportsDefaultKeyword
        ? sql`default`
        : null,
    };
  }

  return valueEntries.reduce(
    (obj, [key, value]) => ({
      ...obj,
      [key]: transformValue(value, columns[key]!, supportsDefaultKeyword),
    }),
    requiredColumns.reduce((defaults, column) => {
      const { datatype, fkColumn, name } = column;
      const { format, group, isArray } = datatype;

      // do not attempt to set a default value for foreign keys, as it'll probably
      // fail due to referential integrity checks!
      if (fkColumn) {
        return defaults;
      }

      if (isArray || group === "json") {
        return { ...defaults, [name]: DEFAULT_JSON };
      }

      if (group === "boolean") {
        return { ...defaults, [name]: DEFAULT_BOOLEAN };
      }

      if (group === "string") {
        return { ...defaults, [name]: DEFAULT_STRING };
      }

      if (group === "numeric") {
        return { ...defaults, [name]: DEFAULT_NUMERIC };
      }

      if ((group === "datetime" || group === "time") && format) {
        return { ...defaults, [name]: getDate0(format) };
      }

      return defaults;
    }, {}) as InsertObject<unknown, never> | UpdateObject<unknown, never>,
  );
}

function transformValue(
  value: unknown,
  column: Column,
  supportsDefaultKeyword = true,
): Expression<any> {
  const { datatype, defaultValue, nullable } = column;

  const eb = expressionBuilder();

  if (value === null || (value === "" && nullable)) {
    return eb.lit(null);
  }

  if ((value === "" || value === undefined) && defaultValue != null) {
    return supportsDefaultKeyword ? sql`default` : eb.lit(null);
  }

  if (!datatype.isNative) {
    return eb.cast(eb.val(value), sql.id(datatype.schema, datatype.name));
  }

  return eb.val(value);
}

export function getSelectFilterExpression(
  filters: (ColumnFilter | FilterGroup | SqlFilter)[],
  columns: Table["columns"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (eb: ExpressionBuilder<any, any>) => Expression<SqlBool> {
  if (filters.length === 0) return (eb) => eb.lit(true); // no filters, always true

  const orGroupsOfAndBuilders: ((
    eb: ExpressionBuilder<any, any>,
  ) => Expression<SqlBool>)[][] = [];

  let currentAndGroupBuilders: ((
    eb: ExpressionBuilder<any, any>,
  ) => Expression<SqlBool>)[] = [];

  for (let i = 0; i < filters.length; i++) {
    currentAndGroupBuilders.push(
      buildBaseExpressionBuilder(filters[i]!, columns),
    );

    // &n AND group ends if it's the last filter, or the item is followed by an 'or'
    if (i === filters.length - 1 || filters[i]!.after === "or") {
      orGroupsOfAndBuilders.push(currentAndGroupBuilders);
      currentAndGroupBuilders = []; // start a new group
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (eb: ExpressionBuilder<any, any>) => {
    const andExpressions = orGroupsOfAndBuilders.map((group) => {
      return eb.and(group.map((builder) => builder(eb)));
    });

    return eb.or(andExpressions);
  };
}

const TEXT_MATCH_OPERATORS = new Set([
  "ilike",
  "like",
  "not ilike",
  "not like",
]);

// Helper to build an expression builder for a single filter or a group
function buildBaseExpressionBuilder(
  spec: ColumnFilter | FilterGroup | SqlFilter,
  columns: Table["columns"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (eb: ExpressionBuilder<any, any>) => Expression<SqlBool> {
  if (spec.kind === "ColumnFilter") {
    return (eb) => {
      const { column, operator, value } = spec;
      const columnMeta = columns[column]!;
      const isTextMatchOperator = TEXT_MATCH_OPERATORS.has(operator);

      if (isTextMatchOperator) {
        const searchPattern =
          typeof value === "string" ? value : String(value ?? "");

        return eb(eb.cast(column, "text"), operator, searchPattern);
      }

      return eb(
        columnMeta.datatype.group === "raw" ? eb.cast(column, "text") : column,
        operator,
        transformValue(value, columnMeta),
      );
    };
  }

  if (spec.kind === "SqlFilter") {
    const normalizedClause = normalizeSqlWhereClause(spec.sql);

    return (eb) =>
      normalizedClause.length > 0
        ? sql<SqlBool>`(${sql.raw(normalizedClause)})`
        : eb.lit(true);
  }

  return getSelectFilterExpression(spec.filters, columns);
}
