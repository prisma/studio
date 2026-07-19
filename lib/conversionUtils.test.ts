import { describe, expect, it } from "vitest";

import type { Column } from "@/data";

import { coerceToValue } from "./conversionUtils";

function createColumn(datatype: Partial<Column["datatype"]>): Column {
  return {
    datatype: {
      group: "numeric",
      isArray: false,
      isNative: true,
      name: "NUMERIC",
      options: [],
      schema: "main",
      ...datatype,
    },
    defaultValue: null,
    fkColumn: null,
    fkSchema: null,
    fkTable: null,
    isAutoincrement: false,
    isComputed: false,
    isRequired: false,
    name: "value",
    nullable: true,
    pkPosition: null,
    schema: "main",
    table: "things",
  } as Column;
}

describe("coerceToValue", () => {
  it("coerces numeric text to a number for numeric columns", () => {
    const column = createColumn({ affinity: "NUMERIC" });

    expect(coerceToValue(column, "=", "42.5")).toBe(42.5);
  });

  it("coerces empty input to null for numeric columns", () => {
    const column = createColumn({ affinity: "NUMERIC" });

    expect(coerceToValue(column, "=", "")).toBeNull();
  });

  it("keeps non-numeric text as-is instead of producing NaN", () => {
    // SQLite `datetime` columns get NUMERIC affinity, but their values are
    // date strings. Coercion must never produce NaN; non-numeric text stays
    // text, matching SQLite's own NUMERIC affinity semantics.
    const column = createColumn({ affinity: "NUMERIC", name: "datetime" });

    expect(coerceToValue(column, "=", "2021-11-01 22:30:00")).toBe(
      "2021-11-01 22:30:00",
    );
  });
});
