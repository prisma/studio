import { describe, expect, it } from "vitest";

import type { Column, FilterOperator, Table } from "../../data/adapter";
import {
  attachAiSourceToEditingFilter,
  createAppliedFilterFromEditing,
  createEditingColumnFilter,
  createEditingSqlFilter,
  type EditingSqlFilter,
  getEditingFilterIssue,
  getEditingFilterSyntaxIssue,
  getSupportedFilterOperatorsForColumn,
  mergeEditingFilterUiMetadata,
} from "./filter-utils";

function createColumn(args: {
  affinity?: string;
  group: Column["datatype"]["group"];
  isArray?: boolean;
  name: string;
  options?: string[];
  typeName?: string;
}): Column {
  return {
    datatype: {
      affinity: args.affinity,
      group: args.group,
      isArray: args.isArray ?? false,
      isNative: true,
      name: args.typeName ?? args.name,
      options: args.options ?? [],
      schema: "pg_catalog",
    },
    defaultValue: null,
    fkColumn: null,
    fkSchema: null,
    fkTable: null,
    isAutoincrement: false,
    isComputed: false,
    isRequired: false,
    name: args.name,
    nullable: true,
    pkPosition: null,
    schema: "public",
    table: "users",
  };
}

function createTable(): Table {
  return {
    columns: {
      attachment: createColumn({
        group: "string",
        name: "attachment",
        typeName: "bytea",
      }),
      created_at: createColumn({
        group: "datetime",
        name: "created_at",
        typeName: "timestamptz",
      }),
      custom_opaque: createColumn({
        group: "raw",
        name: "custom_opaque",
        typeName: "ltree",
      }),
      custom_text: createColumn({
        group: "raw",
        name: "custom_text",
        typeName: "varchar2",
      }),
      enabled: createColumn({
        group: "boolean",
        name: "enabled",
        typeName: "bool",
      }),
      id: createColumn({
        group: "string",
        name: "id",
        typeName: "uuid",
      }),
      metadata: createColumn({
        group: "json",
        name: "metadata",
        typeName: "jsonb",
      }),
      nickname: createColumn({
        group: "string",
        name: "nickname",
        typeName: "text",
      }),
      regions: createColumn({
        group: "string",
        isArray: true,
        name: "regions",
        typeName: "text[]",
      }),
      role: createColumn({
        group: "enum",
        name: "role",
        options: ["admin", "member"],
        typeName: "role",
      }),
      score: createColumn({
        group: "numeric",
        name: "score",
        typeName: "int8",
      }),
      scores: createColumn({
        group: "numeric",
        isArray: true,
        name: "scores",
        typeName: "int8[]",
      }),
      start_time: createColumn({
        group: "time",
        name: "start_time",
        typeName: "time",
      }),
    },
    name: "users",
    schema: "public",
  };
}

function makeFilter(
  column: string,
  operator: FilterOperator | "",
  draftValue: string,
) {
  const filter = createEditingColumnFilter(column);

  filter.operator = operator;
  filter.draftValue = draftValue;
  filter.value = draftValue;

  return filter;
}

describe("filter syntax validation", () => {
  const table = createTable();

  it.each([
    [
      "nickname",
      ["=", "!=", "is", "is not", "like", "not like", "ilike", "not ilike"],
    ],
    [
      "custom_text",
      ["=", "!=", "is", "is not", "like", "not like", "ilike", "not ilike"],
    ],
    [
      "role",
      ["=", "!=", "is", "is not", "like", "not like", "ilike", "not ilike"],
    ],
    ["id", ["=", "!=", "is", "is not"]],
    ["attachment", ["=", "!=", "is", "is not"]],
    ["enabled", ["=", "!=", "is", "is not"]],
    ["score", ["=", "!=", ">", ">=", "<", "<=", "is", "is not"]],
    ["created_at", ["=", "!=", ">", ">=", "<", "<=", "is", "is not"]],
    ["start_time", ["=", "!=", ">", ">=", "<", "<=", "is", "is not"]],
    ["metadata", ["=", "!=", "is", "is not"]],
    [
      "regions",
      ["=", "!=", "is", "is not", "like", "not like", "ilike", "not ilike"],
    ],
    ["scores", ["=", "!=", "is", "is not"]],
    ["custom_opaque", ["=", "!=", "is", "is not"]],
  ] as const)(
    "exposes the correct operator set for %s",
    (columnName, expectedOperators) => {
      expect(
        getSupportedFilterOperatorsForColumn(table.columns[columnName]!),
      ).toEqual(expectedOperators);
    },
  );

  it.each([
    ["nickname", "like", "%abba%"],
    ["custom_text", "ilike", "%abba%"],
    ["role", "=", "admin"],
    ["role", "ilike", "%adm%"],
    ["id", "=", "4f9d4af6-3ce2-4f3d-b4e6-cf8d0f510d4a"],
    ["attachment", "!=", "0xDEADBEEF"],
    ["enabled", "=", "true"],
    ["score", ">", "12.5"],
    ["created_at", ">=", "2026-03-09T08:15:30.000Z"],
    ["start_time", "<", "09:15:30"],
    ["metadata", "=", '{"tier":"pro"}'],
    ["regions", "=", '["emea","apac"]'],
    ["regions", "like", "%emea%"],
    ["scores", "!=", "[1,2,3]"],
    ["custom_opaque", "=", "north.branch"],
    ["nickname", "is", "null"],
  ] as const)(
    "accepts relevant %s filters for %s",
    (columnName, operator, value) => {
      expect(
        getEditingFilterSyntaxIssue(
          makeFilter(columnName, operator, value),
          table.columns,
        ),
      ).toBeNull();
    },
  );

  it.each([
    ["nickname", ">", "abba"],
    ["custom_text", ">=", "abba"],
    ["role", "<", "admin"],
    ["id", "like", "%4f9d%"],
    ["attachment", "ilike", "%dead%"],
    ["enabled", ">", "true"],
    ["score", "ilike", "%12%"],
    ["created_at", "like", "%2026%"],
    ["start_time", "not like", "%09%"],
    ["metadata", "like", "%tier%"],
    ["regions", ">", '["emea"]'],
    ["scores", "ilike", "%1%"],
    ["custom_opaque", "<", "north.branch"],
  ] as const)(
    "rejects irrelevant %s filters for %s",
    (columnName, operator, value) => {
      expect(
        getEditingFilterSyntaxIssue(
          makeFilter(columnName, operator, value),
          table.columns,
        ),
      ).toEqual(
        expect.objectContaining({
          code: "invalid-operator-for-type",
        }),
      );
    },
  );

  it("uses the draft value for syntax validation instead of the coerced value", () => {
    const filter = createEditingColumnFilter("enabled");

    filter.operator = "=";
    filter.draftValue = "maybe";
    filter.value = false;

    expect(getEditingFilterSyntaxIssue(filter, table.columns)).toEqual(
      expect.objectContaining({
        code: "invalid-boolean",
      }),
    );
  });

  it("accepts SQL filters with a non-empty WHERE clause fragment", () => {
    const filter = createEditingSqlFilter(
      "WHERE lower(nickname) like '%abba%'",
    );

    expect(getEditingFilterSyntaxIssue(filter, table.columns)).toBeNull();
  });

  it("rejects empty SQL filters and SQL filters with internal statement separators", () => {
    expect(
      getEditingFilterSyntaxIssue(
        createEditingSqlFilter("WHERE"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "missing-sql",
      }),
    );

    expect(
      getEditingFilterSyntaxIssue(
        createEditingSqlFilter("nickname = 'abba'; select 1"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid-sql-fragment",
      }),
    );
  });

  it("preserves valid SQL filters in the applied filter tree and omits invalid SQL drafts", () => {
    const appliedFilter = createAppliedFilterFromEditing(
      {
        after: "and",
        filters: [
          createEditingSqlFilter("WHERE lower(nickname) like '%abba%'"),
          createEditingSqlFilter("WHERE"),
        ],
        id: "editing",
        kind: "FilterGroup",
      },
      table.columns,
    );

    expect(appliedFilter).toEqual(
      expect.objectContaining({
        after: "and",
        filters: [
          expect.objectContaining({
            after: "and",
            kind: "SqlFilter",
            sql: "WHERE lower(nickname) like '%abba%'",
          }),
        ],
        id: "editing",
        kind: "FilterGroup",
      }),
    );
  });

  it("preserves SQL filters with async lint warnings in the applied tree and strips lint metadata", () => {
    const appliedFilter = createAppliedFilterFromEditing(
      {
        after: "and",
        filters: [
          {
            ...createEditingSqlFilter("WHERE lower(nickname) like '%abba%'"),
            lint: {
              issue: null,
              requestKey: "schema-v1::abba",
              status: "valid",
            },
          },
          {
            ...createEditingSqlFilter("WHERE lower(nickname) like ('%abba%'"),
            lint: {
              issue: {
                code: "sql-lint-error",
                message: 'syntax error at or near "("',
              },
              requestKey: "schema-v1::broken",
              status: "invalid",
            },
          },
        ],
        id: "editing",
        kind: "FilterGroup",
      },
      table.columns,
    );

    expect(appliedFilter.filters).toHaveLength(2);

    for (const [index, appliedSqlFilter] of appliedFilter.filters.entries()) {
      if (appliedSqlFilter.kind !== "SqlFilter") {
        throw new Error(`Expected SQL filter at index ${index}`);
      }

      expect(Object.hasOwn(appliedSqlFilter, "lint")).toBe(false);
    }

    expect(appliedFilter.filters[0]).toEqual(
      expect.objectContaining({
        sql: "WHERE lower(nickname) like '%abba%'",
      }),
    );
    expect(appliedFilter.filters[1]).toEqual(
      expect.objectContaining({
        sql: "WHERE lower(nickname) like ('%abba%'",
      }),
    );
  });

  it("surfaces async SQL lint failures as filter issues after synchronous syntax passes", () => {
    const filter: EditingSqlFilter = {
      ...createEditingSqlFilter("WHERE lower(nickname) like ('%abba%'"),
      lint: {
        issue: {
          code: "sql-lint-error",
          message: 'syntax error at or near "("',
        },
        requestKey: "schema-v1::broken",
        status: "invalid" as const,
      },
    };

    expect(getEditingFilterSyntaxIssue(filter, table.columns)).toBeNull();
    expect(getEditingFilterIssue(filter, table.columns)).toEqual({
      code: "sql-lint-error",
      message: 'syntax error at or near "("',
    });
  });

  it("reports each value-syntax failure category", () => {
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("missing", "=", "x"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "unknown-column",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("nickname", "", "x"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "missing-operator",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("nickname", "is", "abba"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "null-check-only",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("enabled", "=", "maybe"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid-boolean",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("created_at", "=", "not-a-date"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid-datetime",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("role", "=", "owner"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid-enum",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("metadata", "=", "abba"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid-json",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("score", "=", "NaN"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid-number",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("start_time", "=", "99:15"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid-time",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("regions", "=", "emea"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid-array",
      }),
    );
    expect(
      getEditingFilterSyntaxIssue(
        makeFilter("id", "=", "not-a-uuid"),
        table.columns,
      ),
    ).toEqual(
      expect.objectContaining({
        code: "invalid-uuid",
      }),
    );
  });

  it("drops syntactically invalid filters when serializing applied filters with column metadata", () => {
    const validFilter = makeFilter("score", ">", "12.5");
    const invalidFilter = makeFilter("nickname", ">", "acme");
    const appliedFilter = createAppliedFilterFromEditing(
      {
        after: "and",
        filters: [validFilter, invalidFilter],
        id: "editing",
        kind: "FilterGroup",
      },
      table.columns,
    );

    expect(appliedFilter.filters).toEqual([
      expect.objectContaining({
        column: "score",
        operator: ">",
        value: "12.5",
      }),
    ]);
    expect(appliedFilter.filters[0]).not.toHaveProperty("draftValue");
  });

  it("attaches AI request metadata to non-group filters and strips it from the applied filter tree", () => {
    const editingFilterWithAiSource = attachAiSourceToEditingFilter(
      {
        after: "and",
        filters: [
          makeFilter("nickname", "ilike", "%abba%"),
          createEditingSqlFilter("WHERE lower(nickname) like '%abba%'"),
        ],
        id: "editing",
        kind: "FilterGroup",
      },
      "find abba",
    );
    const appliedFilter = createAppliedFilterFromEditing(
      editingFilterWithAiSource,
      table.columns,
    );

    expect(editingFilterWithAiSource.filters).toEqual([
      expect.objectContaining({
        aiSource: {
          query: "find abba",
        },
      }),
      expect.objectContaining({
        aiSource: {
          query: "find abba",
        },
      }),
    ]);
    expect(appliedFilter.filters[0]).not.toHaveProperty("aiSource");
    expect(appliedFilter.filters[1]).not.toHaveProperty("aiSource");
  });

  it("reapplies AI request metadata by filter id when editing filters resync from URL state", () => {
    const syncedFilter = mergeEditingFilterUiMetadata({
      currentFilter: {
        after: "and",
        filters: [
          {
            after: "and",
            column: "nickname",
            id: "nickname-filter",
            kind: "ColumnFilter",
            operator: "ilike",
            value: "%abba%",
          },
        ],
        id: "editing",
        kind: "FilterGroup",
      },
      previousFilter: {
        after: "and",
        filters: [
          {
            ...makeFilter("nickname", "ilike", "%abba%"),
            aiSource: {
              query: "find abba",
            },
            id: "nickname-filter",
          },
        ],
        id: "editing",
        kind: "FilterGroup",
      },
    });

    expect(syncedFilter.filters[0]).toEqual(
      expect.objectContaining({
        aiSource: {
          query: "find abba",
        },
      }),
    );
  });
});
