import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { filterComboboxOptions, TemporalCombobox } from "./TemporalCombobox";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const options = [
  { detail: "407 runs", value: "orderFulfillment" },
  { detail: "166 runs", value: "subscriptionBilling" },
  { value: "merchantPayout" },
];

function Harness(props: { initial: string }) {
  const [value, setValue] = useState(props.initial);

  return (
    <TemporalCombobox
      id="type"
      listLabel="Workflow Types"
      onChange={setValue}
      options={options}
      value={value}
    />
  );
}

describe("TemporalCombobox", () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = "";
  });

  function render(initial = "") {
    const container = document.createElement("div");

    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<Harness initial={initial} />));

    return container.querySelector("input")!;
  }

  function type(input: HTMLInputElement, text: string) {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;

    act(() => {
      input.focus();
      setValue.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const press = (input: HTMLInputElement, key: string) =>
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
      );
    });
  const listed = () =>
    [...document.querySelectorAll('[role="option"]')].map(
      (item) => item.textContent,
    );

  it("lists the options that match the typed text, and Enter takes the first", () => {
    const input = render();

    type(input, "bill");
    expect(listed()).toEqual(["subscriptionBilling166 runs"]);

    press(input, "Enter");
    expect(input.value).toBe("subscriptionBilling");
    expect(listed()).toEqual([]);
  });

  it("opens the whole list from the button, with the current value marked", () => {
    const input = render("merchantPayout");

    act(() =>
      document
        .querySelector<HTMLElement>('[aria-label="Show all Workflow Types"]')!
        .click(),
    );

    // Every option, not only those that match the value in the field.
    expect(listed()).toHaveLength(3);
    expect(
      document.querySelector('[role="option"][aria-selected="true"]')!
        .textContent,
    ).toBe("merchantPayout");

    press(input, "ArrowUp");
    press(input, "Enter");
    expect(input.value).toBe("subscriptionBilling");
  });

  it("keeps a value that is not in the list", () => {
    const input = render();

    type(input, "newWorkflow");
    expect(listed()).toEqual([]);

    press(input, "Enter");
    expect(input.value).toBe("newWorkflow");
  });
});

describe("filterComboboxOptions", () => {
  it("puts the options that start with the text before those that hold it", () => {
    expect(
      filterComboboxOptions(
        [{ value: "subscriptionBilling" }, { value: "billing" }],
        "bill",
      ).map((option) => option.value),
    ).toEqual(["billing", "subscriptionBilling"]);
  });
});
