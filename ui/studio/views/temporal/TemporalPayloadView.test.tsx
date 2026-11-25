import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { payloadSizeText, TemporalPayloadView } from "./TemporalPayloadView";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function render(value: unknown) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<TemporalPayloadView value={value} />);
  });

  return container;
}

describe("TemporalPayloadView", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("lists each field with its name and value, strings without quotes", () => {
    const container = render({ amount: 540, paid: false, stage: "settled" });
    const names = [...container.querySelectorAll("dt")].map(
      (dt) => dt.textContent,
    );
    const values = [...container.querySelectorAll("dd")].map(
      (dd) => dd.textContent,
    );

    expect(names).toEqual(["amount", "paid", "stage"]);
    expect(values).toEqual(["540", "false", "settled"]);
  });

  it("opens nested objects two levels deep and folds deeper ones", () => {
    const container = render({ a: { b: { c: { d: 1 } } } });
    const toggles = [...container.querySelectorAll("button")];

    expect(
      toggles.map((button) => button.getAttribute("aria-expanded")),
    ).toEqual(["true", "true", "false"]);
    expect(container.textContent).not.toContain("d1");

    act(() => {
      toggles[2]!.click();
    });

    expect(container.textContent).toContain("d1");
  });

  it("says when a value is null, an empty string, or an empty object", () => {
    const container = render({ empty: "", none: null, nothing: {} });

    expect(container.textContent).toContain("emptyempty");
    expect(container.textContent).toContain("nonenull");
    expect(container.textContent).toContain("nothingNo fields");
  });

  it("shows a value that is not an object on its own", () => {
    expect(render("done").textContent).toBe("done");
  });

  it("counts fields and items", () => {
    expect(payloadSizeText({ a: 1 })).toBe("1 field");
    expect(payloadSizeText([1, 2])).toBe("2 items");
  });
});
