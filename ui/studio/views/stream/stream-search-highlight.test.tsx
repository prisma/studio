import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { StudioStreamSearchConfig } from "../../../hooks/use-stream-details";
import { HighlightedStreamEventJson } from "./stream-search-highlight";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createSearchConfig(): StudioStreamSearchConfig {
  return {
    aliases: {
      req: "requestId",
    },
    defaultFields: [
      {
        field: "message",
      },
    ],
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
      requestId: {
        aggregatable: false,
        bindings: [
          {
            jsonPointer: "/requestId",
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
      status: {
        aggregatable: false,
        bindings: [
          {
            jsonPointer: "/status",
            version: 1,
          },
        ],
        column: true,
        exact: true,
        exists: true,
        kind: "integer",
        positions: false,
        prefix: false,
        sortable: true,
      },
      tenant: {
        aggregatable: false,
        bindings: [
          {
            jsonPointer: "/tenant",
            version: 1,
          },
        ],
        column: false,
        exact: true,
        exists: true,
        kind: "keyword",
        positions: false,
        prefix: false,
        sortable: false,
      },
    },
    primaryTimestampField: "status",
  };
}

function createMetricsSearchConfig(): StudioStreamSearchConfig {
  return {
    aliases: {},
    defaultFields: [
      {
        field: "metric",
      },
      {
        field: "stream",
      },
      {
        field: "dimensionPairs",
      },
    ],
    fields: {
      dimensionPairs: {
        aggregatable: true,
        bindings: [
          {
            jsonPointer: "/dimensionPairs",
            version: 1,
          },
        ],
        column: false,
        exact: true,
        exists: true,
        kind: "keyword",
        positions: false,
        prefix: false,
        sortable: false,
      },
      metric: {
        aggregatable: true,
        bindings: [
          {
            jsonPointer: "/metric",
            version: 1,
          },
        ],
        column: false,
        exact: true,
        exists: true,
        kind: "keyword",
        positions: false,
        prefix: true,
        sortable: true,
      },
      stream: {
        aggregatable: true,
        bindings: [
          {
            jsonPointer: "/stream",
            version: 1,
          },
        ],
        column: false,
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
}

function renderHighlightedJson(args: {
  searchConfig?: StudioStreamSearchConfig;
  searchQuery: string;
  value: unknown;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <pre>
        <HighlightedStreamEventJson
          searchConfig={args.searchConfig ?? createSearchConfig()}
          searchQuery={args.searchQuery}
          value={args.value}
        />
      </pre>,
    );
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    container,
  };
}

describe("HighlightedStreamEventJson", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("highlights aliases, field existence, phrases, and range matches", () => {
    const rendered = renderHighlightedJson({
      searchQuery:
        'req:req_123 has:tenant message:"issuer declined" status:>=500',
      value: {
        message: "issuer declined for this payment",
        requestId: "req_123",
        status: 503,
        tenant: "acme",
      },
    });

    const marks = Array.from(rendered.container.querySelectorAll("mark")).map(
      (mark) => mark.textContent?.trim(),
    );

    expect(marks).toContain('"requestId"');
    expect(marks).toContain("req_123");
    expect(marks).toContain('"tenant"');
    expect(marks).toContain("issuer declined");
    expect(marks).toContain('"status"');
    expect(marks).toContain("503");

    rendered.cleanup();
  });

  it("ignores negated clauses when highlighting", () => {
    const rendered = renderHighlightedJson({
      searchQuery: "req:req_123 NOT message:timeout",
      value: {
        message: "timeout while processing request",
        requestId: "req_123",
      },
    });

    const marks = Array.from(rendered.container.querySelectorAll("mark")).map(
      (mark) => mark.textContent?.trim(),
    );

    expect(marks).toContain('"requestId"');
    expect(marks).toContain("req_123");
    expect(marks).not.toContain("timeout");

    rendered.cleanup();
  });

  it("highlights only matching values for unfielded exact searches", () => {
    const rendered = renderHighlightedJson({
      searchConfig: createMetricsSearchConfig(),
      searchQuery: '"tieredstore.ingest.queue.requests"',
      value: {
        dimensionPairs: [],
        metric: "tieredstore.ingest.queue.requests",
        seriesKey:
          "summary|delta|tieredstore.ingest.queue.requests|count||6447-02dd1f|",
        stream: null,
      },
    });

    const marks = Array.from(rendered.container.querySelectorAll("mark")).map(
      (mark) => mark.textContent?.trim(),
    );

    expect(marks).toContain("tieredstore.ingest.queue.requests");
    expect(marks).not.toContain('"metric"');
    expect(marks).not.toContain('"stream"');
    expect(marks).not.toContain('"dimensionPairs"');

    rendered.cleanup();
  });

  it("highlights the matched prefix for unfielded wildcard searches", () => {
    const rendered = renderHighlightedJson({
      searchConfig: createMetricsSearchConfig(),
      searchQuery: "tieredstore.ingest.queue.*",
      value: {
        dimensionPairs: [],
        metric: "tieredstore.ingest.queue.requests",
        seriesKey:
          "summary|delta|tieredstore.ingest.queue.requests|count||6447-02dd1f|",
        stream: null,
      },
    });

    const marks = Array.from(rendered.container.querySelectorAll("mark")).map(
      (mark) => mark.textContent?.trim(),
    );

    expect(marks).toContain("tieredstore.ingest.queue.");
    expect(marks).not.toContain('"metric"');
    expect(marks).not.toContain('"stream"');
    expect(marks).not.toContain('"dimensionPairs"');

    rendered.cleanup();
  });
});
