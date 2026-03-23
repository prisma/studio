import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { StringCell } from "./StringCell";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("StringCell", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("highlights matching text when a search term is provided", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StringCell searchTerm="tri" value="  TrIage tri  " />);
    });

    const matches = container.querySelectorAll(
      'mark[data-search-match="true"]',
    );

    expect(matches).toHaveLength(2);
    expect(matches[0]?.textContent).toBe("TrI");
    expect(matches[1]?.textContent).toBe("tri");
    expect(container.textContent).toBe("··TrIage tri··");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders without highlight markup when search is inactive", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<StringCell value="Tristan Ops" />);
    });

    const matches = container.querySelectorAll(
      'mark[data-search-match="true"]',
    );

    expect(matches).toHaveLength(0);
    expect(container.textContent).toBe("Tristan Ops");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
