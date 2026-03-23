import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Column } from "@/data/adapter";

import { DateInput } from "./DateInput";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createColumn(args: { format: string; group: "datetime" | "time" }) {
  return {
    datatype: {
      format: args.format,
      group: args.group,
      isArray: false,
      isNative: true,
      name: "timestamptz",
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
    name: "created_at",
    nullable: true,
    pkPosition: null,
    schema: "public",
    table: "users",
  } as Column;
}

function renderDateInput(column: Column) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <DateInput
        column={column}
        context="edit"
        onSubmit={vi.fn()}
        readonly={false}
        value="2026-02-24T11:13:36.998Z"
      />,
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

describe("DateInput", () => {
  it("shows an explicit local timezone indicator for datetime inputs", () => {
    const harness = renderDateInput(
      createColumn({
        format: "YYYY-MM-DD HH:mm:ss.SSSZZ",
        group: "datetime",
      }),
    );

    expect(harness.container.textContent).toContain(
      "Editing in local time (UTC",
    );

    harness.cleanup();
  });

  it("does not render timezone copy for date-only inputs", () => {
    const harness = renderDateInput(
      createColumn({
        format: "YYYY-MM-DD",
        group: "datetime",
      }),
    );

    expect(harness.container.textContent).not.toContain(
      "Editing in local time (UTC",
    );

    harness.cleanup();
  });
});
