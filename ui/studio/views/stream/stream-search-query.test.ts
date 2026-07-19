import { describe, expect, it } from "vitest";

import type { StudioStreamSearchConfig } from "../../../hooks/use-stream-details";
import {
  canApplyStreamSearchQuery,
  validateStreamSearchQuery,
} from "./stream-search-query";

const searchConfig: StudioStreamSearchConfig = {
  aliases: {},
  defaultFields: [
    {
      field: "message",
    },
  ],
  fields: {
    avg: {
      aggregatable: true,
      bindings: [
        {
          jsonPointer: "/avg",
          version: 1,
        },
      ],
      column: false,
      exact: true,
      exists: true,
      kind: "float",
      positions: false,
      prefix: false,
      sortable: true,
    },
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
  },
  primaryTimestampField: "message",
};

describe("canApplyStreamSearchQuery", () => {
  it("accepts complete supported search clauses", () => {
    expect(canApplyStreamSearchQuery("timeout")).toBe(true);
    expect(canApplyStreamSearchQuery("req:req_*")).toBe(true);
    expect(canApplyStreamSearchQuery('metric:"process.rss.bytes"')).toBe(true);
    expect(canApplyStreamSearchQuery("(service:api OR service:worker)")).toBe(
      true,
    );
    expect(canApplyStreamSearchQuery("status:>=500 NOT has:why")).toBe(true);
  });

  it("rejects incomplete or unsupported clauses", () => {
    expect(canApplyStreamSearchQuery("metric:")).toBe(false);
    expect(canApplyStreamSearchQuery("has:")).toBe(false);
    expect(canApplyStreamSearchQuery('"unterminated')).toBe(false);
    expect(canApplyStreamSearchQuery("(service:api OR service:worker")).toBe(
      false,
    );
    expect(canApplyStreamSearchQuery("contains:boom")).toBe(false);
  });

  it("returns a detailed validation message for invalid syntax", () => {
    expect(validateStreamSearchQuery("metric:")).toEqual({
      isValid: false,
      message: 'Expected a value after "metric:".',
    });
    expect(validateStreamSearchQuery("avg:", searchConfig)).toEqual({
      isValid: false,
      message:
        'Expected a numeric value after "avg:". Supported forms: number literal, > number literal, >= number literal, < number literal, <= number literal.',
    });
    expect(validateStreamSearchQuery('"unterminated')).toEqual({
      isValid: false,
      message:
        'The quoted value is not closed. Add a matching double quote (").',
    });
    expect(validateStreamSearchQuery("contains:boom")).toEqual({
      isValid: false,
      message:
        '"contains:" is not supported here. Use a plain text term or a fielded clause such as metric:"process.rss.bytes".',
    });
  });
});
