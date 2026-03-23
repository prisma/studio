import type { Cell as TableCell } from "@tanstack/react-table";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { Column } from "../../../data/adapter";
import { getCell } from "./get-cell";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createColumn(args: {
  group: Column["datatype"]["group"];
  isArray?: boolean;
  typeName: string;
}): Column {
  const { group, isArray = false, typeName } = args;

  return {
    datatype: {
      group,
      isArray,
      isNative: true,
      name: typeName,
      options: [],
      schema: "pg_catalog",
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
    schema: "public",
    table: "users",
  };
}

function createCell(
  value: unknown,
): TableCell<Record<string, unknown>, unknown> {
  return {
    getValue: () => value,
  } as unknown as TableCell<Record<string, unknown>, unknown>;
}

describe("getCell", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("highlights matches for non-string displayed values", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const column = createColumn({ group: "numeric", typeName: "int4" });

    act(() => {
      root.render(
        <>{getCell({ cell: createCell(12345), column, searchTerm: "23" })}</>,
      );
    });

    const matches = container.querySelectorAll(
      'mark[data-search-match="true"]',
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.textContent).toBe("23");
    expect(container.textContent).toBe("12345");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
