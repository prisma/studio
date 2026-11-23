import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TemporalFacets } from "@/data/temporal";

import { TemporalSearchField } from "./TemporalSearchField";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const facets: TemporalFacets = {
  complete: true,
  searchAttributes: [],
  taskQueues: [{ count: 12, name: "billing" }],
  workflowTypes: [],
};

function Harness(props: { onSubmit: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <TemporalSearchField
      draft={draft}
      facets={facets}
      inputRef={inputRef}
      onClear={() => setDraft("")}
      onDraftChange={setDraft}
      onSubmit={props.onSubmit}
    />
  );
}

const roots: Array<ReturnType<typeof createRoot>> = [];

function render() {
  const onSubmit = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  document.body.appendChild(container);
  roots.push(root);

  act(() => {
    root.render(<Harness onSubmit={onSubmit} />);
  });

  const input = container.querySelector("input")!;
  const type = (text: string) =>
    act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, text);
      input.setSelectionRange(text.length, text.length);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const press = (key: string) =>
    act(() => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
      });

      input.dispatchEvent(event);

      if (key === "Enter" && !event.defaultPrevented) {
        container.querySelector("form")!.requestSubmit();
      }
    });
  const options = () =>
    [...document.querySelectorAll('[role="option"]')].map(
      (option) => option.firstElementChild?.textContent,
    );

  return { input, onSubmit, options, press, type };
}

describe("TemporalSearchField", () => {
  afterEach(() => {
    // Unmounting lets the list's portal remove itself before the body is emptied.
    act(() => {
      for (const root of roots.splice(0)) {
        root.unmount();
      }
    });
    document.body.innerHTML = "";
  });

  it("completes an attribute with Tab, puts the cursor in the quotes and then offers its values", () => {
    const { input, onSubmit, options, press, type } = render();

    type("Ta");
    expect(options()).toEqual(["TaskQueue"]);

    press("Tab");
    expect(input.value).toBe('TaskQueue = ""');
    expect(input.selectionStart).toBe(13);
    expect(options()).toEqual(["billing"]);

    press("Tab");
    expect(input.value).toBe('TaskQueue = "billing"');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("searches the text as typed on Enter, and takes an item on Enter once the arrow keys chose it", () => {
    const { input, onSubmit, press, type } = render();

    type("Ta");
    press("Enter");
    expect(onSubmit).toHaveBeenCalledWith("Ta");
    expect(input.value).toBe("Ta");

    type("Tas");
    press("ArrowDown");
    press("Enter");
    expect(input.value).toBe('TaskQueue = ""');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
