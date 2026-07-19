import { describe, expect, it } from "vitest";

import {
  applyRoutingKeySearchSelection,
  createRoutingKeysAfterCursorForPrefix,
  createRoutingKeysPrefixUpperBound,
  resolveRoutingKeySearchField,
} from "./stream-routing-key-search";

describe("resolveRoutingKeySearchField", () => {
  it("resolves the shortest alias for an exact keyword routing-key field", () => {
    expect(
      resolveRoutingKeySearchField({
        routingKey: {
          jsonPointer: "/seriesKey",
          required: true,
        },
        searchConfig: {
          aliases: {
            rk: "seriesKey",
            series: "seriesKey",
          },
          defaultFields: [],
          fields: {
            message: {
              aggregatable: false,
              bindings: [
                {
                  jsonPointer: "/message",
                  version: 1,
                },
              ],
              column: false,
              exact: false,
              exists: true,
              kind: "text",
              positions: true,
              prefix: false,
              sortable: false,
            },
            seriesKey: {
              aggregatable: false,
              bindings: [
                {
                  jsonPointer: "/seriesKey",
                  version: 1,
                },
              ],
              column: false,
              exact: true,
              exists: true,
              kind: "keyword",
              positions: false,
              prefix: true,
              sortable: false,
            },
          },
          primaryTimestampField: "seriesKey",
        },
      }),
    ).toEqual({
      fieldName: "seriesKey",
      jsonPointer: "/seriesKey",
      queryFieldName: "rk",
      required: true,
    });
  });

  it("returns null when the routing key is not searchable as an exact keyword", () => {
    expect(
      resolveRoutingKeySearchField({
        routingKey: {
          jsonPointer: "/repoName",
          required: false,
        },
        searchConfig: {
          aliases: {},
          defaultFields: [],
          fields: {
            repoName: {
              aggregatable: false,
              bindings: [
                {
                  jsonPointer: "/repoName",
                  version: 1,
                },
              ],
              column: false,
              exact: false,
              exists: true,
              kind: "text",
              positions: true,
              prefix: true,
              sortable: false,
            },
          },
          primaryTimestampField: "repoName",
        },
      }),
    ).toBeNull();
  });
});

describe("applyRoutingKeySearchSelection", () => {
  it("creates a routing-key clause when no search is active", () => {
    expect(
      applyRoutingKeySearchSelection({
        currentSearchTerm: "",
        queryFieldName: "series",
        routingKey: 'summary|delta|"quoted"',
      }),
    ).toBe('series:"summary|delta|\\"quoted\\""');
  });

  it("prepends the routing-key clause to an existing search", () => {
    expect(
      applyRoutingKeySearchSelection({
        currentSearchTerm: 'metric:"process.rss.bytes"',
        queryFieldName: "series",
        routingKey: "summary|delta|process.rss.bytes",
      }),
    ).toBe(
      'series:"summary|delta|process.rss.bytes" AND (metric:"process.rss.bytes")',
    );
  });

  it("replaces a previously injected routing-key clause", () => {
    expect(
      applyRoutingKeySearchSelection({
        currentSearchTerm:
          'series:"summary|delta|old" AND (metric:"process.rss.bytes")',
        queryFieldName: "series",
        routingKey: "summary|delta|new",
      }),
    ).toBe('series:"summary|delta|new" AND (metric:"process.rss.bytes")');
  });
});

describe("routing-key prefix cursors", () => {
  it("creates an exclusive cursor just before the requested prefix", () => {
    expect(createRoutingKeysAfterCursorForPrefix("repo/")).toBe("repo.\uffff");
  });

  it("creates an upper bound just after the requested prefix range", () => {
    expect(createRoutingKeysPrefixUpperBound("repo/")).toBe("repo0");
  });

  it("returns null bounds for the empty prefix", () => {
    expect(createRoutingKeysAfterCursorForPrefix("")).toBeNull();
    expect(createRoutingKeysPrefixUpperBound("")).toBeNull();
  });
});
