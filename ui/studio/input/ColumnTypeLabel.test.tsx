import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { Column } from "../../../data/adapter";
import { ColumnTypeLabel } from "./ColumnTypeLabel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createColumn(args: {
  group: Column["datatype"]["group"];
  name: string;
  schema?: string;
  isArray?: boolean;
  nullable?: boolean;
}): Column {
  return {
    datatype: {
      group: args.group,
      isArray: args.isArray ?? false,
      isNative: true,
      name: args.name,
      options: [],
      schema: args.schema ?? "pg_catalog",
    },
    defaultValue: null,
    fkColumn: null,
    fkSchema: null,
    fkTable: null,
    isAutoincrement: false,
    isComputed: false,
    isRequired: false,
    name: args.name,
    nullable: args.nullable ?? true,
    pkPosition: null,
    schema: "public",
    table: "users",
  } as Column;
}

function renderLabel(column: Column) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ColumnTypeLabel column={column}>
        <div>editor</div>
      </ColumnTypeLabel>,
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

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ColumnTypeLabel", () => {
  it("surfaces the introspected DB type using the display alias", () => {
    const harness = renderLabel(
      createColumn({ group: "string", name: "varchar" }),
    );

    expect(harness.container.textContent).toContain("type: varchar");

    harness.cleanup();
  });

  it("aliases catalog names to common SQL spellings (int4 -> integer)", () => {
    const harness = renderLabel(
      createColumn({ group: "numeric", name: "int4" }),
    );

    expect(harness.container.textContent).toContain("type: integer");

    harness.cleanup();
  });

  it("annotates array columns", () => {
    const harness = renderLabel(
      createColumn({ group: "numeric", name: "int4[]", isArray: true }),
    );

    expect(harness.container.textContent).toContain("type: integer[] (array)");

    harness.cleanup();
  });

  it("keeps user-defined type names unchanged", () => {
    const harness = renderLabel(
      createColumn({ group: "enum", name: "mood", schema: "public" }),
    );

    expect(harness.container.textContent).toContain("type: mood");

    harness.cleanup();
  });

  it("exposes an accessible aria-label with the type name", () => {
    const harness = renderLabel(
      createColumn({ group: "boolean", name: "bool" }),
    );

    const trigger = harness.container.querySelector(
      '[aria-label="Column type: boolean"]',
    );

    expect(trigger).not.toBeNull();

    harness.cleanup();
  });

  it("renders the editor children below the type label", () => {
    const harness = renderLabel(
      createColumn({ group: "string", name: "text" }),
    );

    expect(harness.container.textContent).toContain("editor");

    harness.cleanup();
  });
});
