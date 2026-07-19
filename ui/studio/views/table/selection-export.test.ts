import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCellSelectionExportTable,
  buildRowSelectionExportTable,
  buildSelectionExportFilename,
  downloadSelectionExport,
  serializeSelectionExport,
} from "./selection-export";

describe("selection-export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds cell selection export tables from the selected range", () => {
    expect(
      buildCellSelectionExportTable({
        columnIds: ["id", "name", "notes"],
        range: {
          rowStart: 0,
          rowEnd: 1,
          columnStart: 1,
          columnEnd: 2,
        },
        rows: [
          {
            __ps_rowid: "row-1",
            id: "org_acme",
            name: "Acme Labs",
            notes: "Line 1\nLine 2",
          },
          {
            __ps_rowid: "row-2",
            id: "org_northwind",
            name: "Northwind Retail",
            notes: { owner: "ops@northwind.io" },
          },
        ],
      }),
    ).toEqual({
      columnIds: ["name", "notes"],
      rows: [
        ["Acme Labs", "Line 1\nLine 2"],
        ["Northwind Retail", { owner: "ops@northwind.io" }],
      ],
    });
  });

  it("builds row selection export tables in current row order", () => {
    expect(
      buildRowSelectionExportTable({
        columnIds: ["id", "name"],
        rowSelectionState: {
          "row-1": true,
          "row-3": true,
        },
        rows: [
          { __ps_rowid: "row-1", id: "org_acme", name: "Acme Labs" },
          { __ps_rowid: "row-2", id: "org_northwind", name: "Northwind" },
          { __ps_rowid: "row-3", id: "org_globex", name: "Globex Corp" },
        ],
      }),
    ).toEqual({
      columnIds: ["id", "name"],
      rows: [
        ["org_acme", "Acme Labs"],
        ["org_globex", "Globex Corp"],
      ],
    });
  });

  it("serializes csv exports with optional headers and escaping", () => {
    const table = {
      columnIds: ["id", "notes"],
      rows: [
        ["org_acme", 'Value with "quotes"'],
        ["org_northwind", "Line 1\nLine 2"],
      ],
    };

    expect(
      serializeSelectionExport({
        table,
        format: "csv",
        includeColumnHeader: true,
      }),
    ).toBe(
      'id,notes\norg_acme,"Value with ""quotes"""\norg_northwind,"Line 1\nLine 2"',
    );
    expect(
      serializeSelectionExport({
        table,
        format: "csv",
        includeColumnHeader: false,
      }),
    ).toBe('org_acme,"Value with ""quotes"""\norg_northwind,"Line 1\nLine 2"');
  });

  it("serializes markdown exports with optional headers and escaping", () => {
    const table = {
      columnIds: ["name", "notes"],
      rows: [["Acme | Labs", "Line 1\nLine 2"]],
    };

    expect(
      serializeSelectionExport({
        table,
        format: "markdown",
        includeColumnHeader: true,
      }),
    ).toBe(
      "| name | notes |\n| --- | --- |\n| Acme \\| Labs | Line 1<br />Line 2 |",
    );
    expect(
      serializeSelectionExport({
        table,
        format: "markdown",
        includeColumnHeader: false,
      }),
    ).toBe("| Acme \\| Labs | Line 1<br />Line 2 |");
  });

  it("serializes json exports as an array of objects keyed by column id", () => {
    const table = {
      columnIds: ["id", "notes", "is_active", "tags", "score", "meta"],
      rows: [
        [
          "org_acme",
          'Value with "quotes"',
          true,
          ["a", "b"],
          42,
          { owner: "ops@acme.io" },
        ],
        ["org_northwind", null, false, [], 0, { owner: null }],
      ],
    };

    expect(
      serializeSelectionExport({
        table,
        format: "json",
        includeColumnHeader: true,
      }),
    ).toBe(
      JSON.stringify(
        [
          {
            id: "org_acme",
            notes: 'Value with "quotes"',
            is_active: true,
            tags: ["a", "b"],
            score: 42,
            meta: { owner: "ops@acme.io" },
          },
          {
            id: "org_northwind",
            notes: null,
            is_active: false,
            tags: [],
            score: 0,
            meta: { owner: null },
          },
        ],
        null,
        2,
      ),
    );
    expect(
      serializeSelectionExport({
        table,
        format: "json",
        includeColumnHeader: false,
      }),
    ).toBe(
      JSON.stringify(
        [
          {
            id: "org_acme",
            notes: 'Value with "quotes"',
            is_active: true,
            tags: ["a", "b"],
            score: 42,
            meta: { owner: "ops@acme.io" },
          },
          {
            id: "org_northwind",
            notes: null,
            is_active: false,
            tags: [],
            score: 0,
            meta: { owner: null },
          },
        ],
        null,
        2,
      ),
    );
  });

  it("serializes a single-row json export as one object", () => {
    const table = {
      columnIds: ["id", "notes", "is_active"],
      rows: [["org_acme", 'Value with "quotes"', true]],
    };

    expect(
      serializeSelectionExport({
        table,
        format: "json",
        includeColumnHeader: true,
      }),
    ).toBe(
      JSON.stringify(
        { id: "org_acme", notes: 'Value with "quotes"', is_active: true },
        null,
        2,
      ),
    );
  });

  it("serializes bigint and undefined json values safely", () => {
    const table = {
      columnIds: ["id", "count", "optional"],
      rows: [["org_acme", 42n, undefined]],
    };

    expect(
      serializeSelectionExport({
        table,
        format: "json",
        includeColumnHeader: true,
      }),
    ).toBe(
      JSON.stringify(
        { id: "org_acme", count: "42", optional: null },
        null,
        2,
      ),
    );
  });

  it("builds stable filenames for saved exports", () => {
    expect(
      buildSelectionExportFilename({
        schema: "public",
        table: "users",
        format: "csv",
      }),
    ).toBe("public-users-selection.csv");
    expect(
      buildSelectionExportFilename({
        schema: "public",
        table: "users",
        format: "markdown",
      }),
    ).toBe("public-users-selection.md");
    expect(
      buildSelectionExportFilename({
        schema: "public",
        table: "users",
        format: "json",
      }),
    ).toBe("public-users-selection.json");
  });

  it("downloads the serialized export via a temporary object url", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:selection-export");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadSelectionExport({
      content: "id,name\norg_acme,Acme Labs",
      filename: "public-users-selection.csv",
      format: "csv",
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);

    const blobArg = createObjectURL.mock.calls[0]?.[0];

    if (!(blobArg instanceof Blob)) {
      throw new Error("Expected selection export download to use a Blob");
    }

    expect(await blobArg.text()).toBe("id,name\norg_acme,Acme Labs");
    expect(blobArg.type).toBe("text/csv;charset=utf-8");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:selection-export");
  });

  it("downloads json exports with the json mime type", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:selection-export");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadSelectionExport({
      content: '[\n  {\n    "id": "org_acme"\n  }\n]',
      filename: "public-users-selection.json",
      format: "json",
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);

    const blobArg = createObjectURL.mock.calls[0]?.[0];

    if (!(blobArg instanceof Blob)) {
      throw new Error("Expected selection export download to use a Blob");
    }

    expect(await blobArg.text()).toBe('[\n  {\n    "id": "org_acme"\n  }\n]');
    expect(blobArg.type).toBe("application/json;charset=utf-8");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:selection-export");
  });
});
