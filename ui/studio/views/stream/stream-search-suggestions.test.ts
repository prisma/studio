import { describe, expect, it } from "vitest";

import type { StudioStreamSearchConfig } from "../../../hooks/use-stream-details";
import type { StudioStreamEvent } from "../../../hooks/use-stream-events";
import {
  getStreamSearchSuggestions,
  mergeRememberedStreamSearchEvents,
} from "./stream-search-suggestions";

const SEARCH_CONFIG: StudioStreamSearchConfig = {
  aliases: {},
  defaultFields: [],
  fields: {
    dimensionKey: {
      aggregatable: true,
      bindings: [
        {
          jsonPointer: "/dimensionKey",
          version: 1,
        },
      ],
      column: true,
      exact: true,
      exists: true,
      kind: "keyword",
      positions: false,
      prefix: true,
      sortable: true,
    },
    metric: {
      aggregatable: true,
      bindings: [
        {
          jsonPointer: "/metric",
          version: 1,
        },
      ],
      column: true,
      exact: true,
      exists: true,
      kind: "keyword",
      positions: false,
      prefix: true,
      sortable: true,
    },
    unit: {
      aggregatable: true,
      bindings: [
        {
          jsonPointer: "/unit",
          version: 1,
        },
      ],
      column: true,
      exact: true,
      exists: true,
      kind: "keyword",
      positions: false,
      prefix: true,
      sortable: true,
    },
  },
  primaryTimestampField: "metric",
};

const EVENTS: StudioStreamEvent[] = [
  {
    body: {
      dimensionKey: "process.rss.bytes",
      metric: "process.rss.bytes",
      unit: "bytes",
    },
    exactTimestamp: null,
    id: "event-1",
    indexedFields: [],
    key: null,
    offset: "3",
    preview: "",
    sequence: "3",
    sizeBytes: 1,
    sortOffset: "3",
    streamName: "__stream_metrics__",
  },
  {
    body: {
      dimensionKey: "tieredstore.read.bytes",
      metric: "tieredstore.read.bytes",
      unit: "bytes",
    },
    exactTimestamp: null,
    id: "event-2",
    indexedFields: [],
    key: null,
    offset: "2",
    preview: "",
    sequence: "2",
    sizeBytes: 1,
    sortOffset: "2",
    streamName: "__stream_metrics__",
  },
  {
    body: {
      dimensionKey: "process.rss.bytes",
      metric: "process.rss.bytes",
      unit: "bytes",
    },
    exactTimestamp: null,
    id: "event-3",
    indexedFields: [],
    key: null,
    offset: "1",
    preview: "",
    sequence: "1",
    sizeBytes: 1,
    sortOffset: "1",
    streamName: "__stream_metrics__",
  },
];

describe("getStreamSearchSuggestions", () => {
  it("suggests available field clauses immediately for empty input", () => {
    const suggestions = getStreamSearchSuggestions({
      events: EVENTS,
      input: "",
      searchConfig: SEARCH_CONFIG,
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "dimensionKey:",
      "metric:",
      "unit:",
    ]);
    expect(suggestions[0]?.annotation).toBe("Field (string)");
    expect(suggestions[1]?.annotation).toBe("Field (string)");
    expect(suggestions[2]?.annotation).toBe("Field (string)");
  });

  it('suggests field clauses for trailing field prefixes like "met"', () => {
    const suggestions = getStreamSearchSuggestions({
      events: EVENTS,
      input: "met",
      searchConfig: SEARCH_CONFIG,
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toContain(
      "metric:",
    );
  });

  it('suggests loaded event values for incomplete field clauses like "metric:"', () => {
    const suggestions = getStreamSearchSuggestions({
      events: EVENTS,
      input: "metric:",
      searchConfig: SEARCH_CONFIG,
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining([
        'metric:"process.rss.bytes"',
        'metric:"tieredstore.read.bytes"',
      ]),
    );
    expect(suggestions[0]?.label).toBe('metric:"process.rss.bytes"');
    expect(suggestions[0]?.annotation).toBe("Loaded event value (unit: bytes)");
  });

  it('includes the unit in value suggestions for other string fields like "dimensionKey:"', () => {
    const suggestions = getStreamSearchSuggestions({
      events: EVENTS,
      input: "dimensionKey:",
      searchConfig: SEARCH_CONFIG,
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining([
        'dimensionKey:"process.rss.bytes"',
        'dimensionKey:"tieredstore.read.bytes"',
      ]),
    );
    expect(suggestions[0]?.annotation).toBe("Loaded event value (unit: bytes)");
  });

  it("suggests boolean operators after a complete clause followed by whitespace", () => {
    const suggestions = getStreamSearchSuggestions({
      events: EVENTS,
      input: 'metric:"process.rss.bytes" ',
      searchConfig: SEARCH_CONFIG,
    });

    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "AND",
      "OR",
      "NOT",
    ]);
  });

  it("retains previously seen events when the newest filtered result set is empty", () => {
    const rememberedEvents = mergeRememberedStreamSearchEvents({
      nextEvents: [],
      previousEvents: EVENTS,
    });

    expect(rememberedEvents).toEqual(EVENTS);
  });

  it("caps field suggestions at 100 items", () => {
    const searchConfig: StudioStreamSearchConfig = {
      aliases: {},
      defaultFields: [],
      fields: Object.fromEntries(
        Array.from({ length: 140 }, (_, index) => [
          `metricField${index.toString().padStart(3, "0")}`,
          {
            aggregatable: true,
            bindings: [
              {
                jsonPointer: `/field${index}`,
                version: 1,
              },
            ],
            column: true,
            exact: true,
            exists: true,
            kind: "keyword",
            positions: false,
            prefix: true,
            sortable: true,
          } satisfies StudioStreamSearchConfig["fields"][string],
        ]),
      ),
      primaryTimestampField: "metricField000",
    };

    const suggestions = getStreamSearchSuggestions({
      events: EVENTS,
      input: "",
      searchConfig,
    });

    expect(suggestions).toHaveLength(100);
    expect(suggestions[0]?.label).toBe("metricField000:");
    expect(suggestions.at(-1)?.label).toBe("metricField099:");
  });
});
