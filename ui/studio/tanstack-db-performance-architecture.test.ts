import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

function listProductionUiSourceFiles(): string[] {
  const root = join(process.cwd(), "ui");
  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current)) {
      const nextPath = join(current, entry);
      const stats = statSync(nextPath);

      if (stats.isDirectory()) {
        stack.push(nextPath);
        continue;
      }

      if (!/\.(ts|tsx)$/.test(entry)) {
        continue;
      }

      if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
        continue;
      }

      files.push(nextPath);
    }
  }

  return files;
}

describe("TanStack DB architecture compliance", () => {
  it("keeps createCollection usage constrained to instrumented collection boundaries", () => {
    const files = listProductionUiSourceFiles();
    const filesWithCreateCollection = files
      .filter((filePath) =>
        readFileSync(filePath, "utf8").includes("createCollection("),
      )
      .map((filePath) =>
        relative(process.cwd(), filePath).replaceAll("\\", "/"),
      )
      .sort();

    expect(filesWithCreateCollection).toEqual(
      [
        "ui/hooks/use-active-table-rows-collection.ts",
        "ui/hooks/use-ui-state.ts",
        "ui/studio/context.tsx",
      ].sort(),
    );
  });

  it("instruments fallback ui state collection and avoids TanStack DB reads for cleanup-on-unmount state", () => {
    const source = readFileSync(
      join(process.cwd(), "ui/hooks/use-ui-state.ts"),
      "utf8",
    );

    expect(source).toContain(
      "const fallbackUiStateCollection = instrumentTanStackCollectionMutations(",
    );
    expect(source).toContain("if (cleanupOnUnmount || !key)");
  });

  it("keeps per-cell popover open state local and prevents per-cell hook reads of global navigation/introspection state", () => {
    const popoverCellSource = readFileSync(
      join(process.cwd(), "ui/components/ui/popover-cell.tsx"),
      "utf8",
    );
    const linkCellSource = readFileSync(
      join(process.cwd(), "ui/studio/cell/Link.tsx"),
      "utf8",
    );

    expect(popoverCellSource).not.toContain("useUiState");
    expect(popoverCellSource).toMatch(/useState\(false\)/);

    expect(linkCellSource).not.toMatch(/\buseNavigation\(/);
    expect(linkCellSource).not.toMatch(/\buseIntrospection\(/);
  });

  it("uses shared grid context menu plumbing and active-cell-only editor mounting", () => {
    const dataGridSource = readFileSync(
      join(process.cwd(), "ui/studio/grid/DataGrid.tsx"),
      "utf8",
    );
    const writableCellSource = readFileSync(
      join(process.cwd(), "ui/studio/cell/WriteableCell.tsx"),
      "utf8",
    );
    const activeTableViewSource = readFileSync(
      join(process.cwd(), "ui/studio/views/table/ActiveTableView.tsx"),
      "utf8",
    );

    expect(dataGridSource).toContain("<ContextMenu>");
    expect(dataGridSource).toContain(
      "onContextMenuCapture={handleGridContextMenuCapture}",
    );
    expect(dataGridSource).toContain("withContextMenu={false}");
    expect(dataGridSource).not.toContain("contextMenuCopyText={() =>");

    expect(writableCellSource).toContain("if (!open)");
    expect(writableCellSource).toContain("withContextMenu={false}");

    expect(activeTableViewSource).toContain("activeEditorCellKey");
    expect(activeTableViewSource).toContain("setActiveEditorCellKey");
  });
});
