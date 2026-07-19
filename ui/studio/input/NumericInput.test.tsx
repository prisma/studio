import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Column } from "@/data/adapter";

import { NumericInput } from "./NumericInput";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createNumericAffinityColumn(): Column {
  // Mirrors a SQLite column declared as e.g. `datetime`/`decimal`, which gets
  // NUMERIC affinity and therefore the numeric input.
  return {
    datatype: {
      affinity: "NUMERIC",
      group: "numeric",
      isArray: false,
      isNative: true,
      name: "decimal",
      options: [],
      schema: "main",
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

function renderNumericInput(args: {
  onSubmit: (value: unknown) => void;
  value: unknown;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <NumericInput
        column={createNumericAffinityColumn()}
        context="edit"
        onSubmit={args.onSubmit}
        readonly={false}
        value={args.value}
      />,
    );
  });

  const input = container.querySelector("input");

  if (!input) {
    throw new Error("Expected numeric input element");
  }

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    input,
  };
}

function inputText(element: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.bind(element);

  valueSetter?.(value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressEnter(element: HTMLInputElement) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("NumericInput", () => {
  it("submits numeric text as a number", () => {
    const onSubmit = vi.fn();
    const harness = renderNumericInput({ onSubmit, value: 1 });

    act(() => {
      inputText(harness.input, "42.5");
    });
    act(() => {
      pressEnter(harness.input);
    });

    expect(onSubmit).toHaveBeenCalledWith(42.5);

    harness.cleanup();
  });

  it("submits non-numeric text as-is instead of NaN", () => {
    // Reproduces prisma/studio#1361: typing a date-like string into a SQLite
    // NUMERIC-affinity column must never be written as NaN.
    const onSubmit = vi.fn();
    const harness = renderNumericInput({
      onSubmit,
      value: "2021-11-01 21:30:00",
    });

    act(() => {
      inputText(harness.input, "2021-11-01 22:30:00");
    });
    act(() => {
      pressEnter(harness.input);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("2021-11-01 22:30:00");

    harness.cleanup();
  });

  it("submits the empty value when cleared", () => {
    const onSubmit = vi.fn();
    const harness = renderNumericInput({ onSubmit, value: 1 });

    act(() => {
      inputText(harness.input, "");
    });
    act(() => {
      pressEnter(harness.input);
    });

    expect(onSubmit).toHaveBeenCalledWith(null);

    harness.cleanup();
  });
});
