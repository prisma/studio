import type { AccessorKeyColumnDefBase } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import { getColumnDefinitionIdentityKey } from "./DataGrid";

function createColumn(
  id: string,
): AccessorKeyColumnDefBase<Record<string, unknown>> {
  return {
    accessorKey: id,
    id,
  };
}

describe("getColumnDefinitionIdentityKey", () => {
  it("stays stable when column definitions are recreated with the same ids", () => {
    const first = [createColumn("name"), createColumn("email")];
    const second = [createColumn("name"), createColumn("email")];

    expect(getColumnDefinitionIdentityKey(first)).toBe(
      getColumnDefinitionIdentityKey(second),
    );
  });

  it("changes when the column identity set changes", () => {
    const first = [createColumn("name"), createColumn("email")];
    const second = [createColumn("name"), createColumn("role")];

    expect(getColumnDefinitionIdentityKey(first)).not.toBe(
      getColumnDefinitionIdentityKey(second),
    );
  });

  it("uses accessorKey when id is not set", () => {
    const columns: AccessorKeyColumnDefBase<Record<string, unknown>>[] = [
      {
        accessorKey: "organization_id",
      },
      {
        accessorKey: "name",
      },
    ];

    expect(getColumnDefinitionIdentityKey(columns)).toBe(
      "organization_id|name",
    );
  });
});
