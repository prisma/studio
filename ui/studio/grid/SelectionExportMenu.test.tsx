import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelectionExportMenu } from "./SelectionExportMenu";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ROWS = [
  {
    __ps_rowid: "row-1",
    email: "alice@example.com",
    id: "user_1",
  },
  {
    __ps_rowid: "row-2",
    email: "bob@example.com",
    id: "user_2",
  },
];

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function dispatchPointerClick(element: Element | null | undefined) {
  if (!element) {
    return;
  }

  const PointerEventConstructor = window.PointerEvent ?? MouseEvent;

  act(() => {
    element.dispatchEvent(
      new PointerEventConstructor("pointerdown", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
  });
}

function findButtonByText(text: string) {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent?.trim() === text);
}

function findMenuItemByText(text: string) {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((item) => item.textContent?.trim() === text);
}

function renderMenu(
  props: Partial<Parameters<typeof SelectionExportMenu>[0]> = {},
) {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  act(() => {
    root.render(
      <SelectionExportMenu
        cellSelectionRange={null}
        columnIds={["id", "email"]}
        filenameBase="sql-result"
        rows={ROWS}
        rowSelectionState={{}}
        {...props}
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
  };
}

describe("SelectionExportMenu", () => {
  it("stays hidden while nothing is selected", () => {
    const view = renderMenu();

    expect(findButtonByText("copy as")).toBeUndefined();

    view.cleanup();
  });

  it("copies the selected rows as csv with column headers by default", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    const view = renderMenu({
      rowSelectionState: { "row-1": true, "row-2": true },
    });

    dispatchPointerClick(findButtonByText("copy as"));
    await flush();

    dispatchPointerClick(findMenuItemByText("copy csv"));

    expect(writeText).toHaveBeenCalledWith(
      "id,email\nuser_1,alice@example.com\nuser_2,bob@example.com",
    );

    view.cleanup();
  });

  it("saves a cell range using the filename base of the host view", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:selection-export");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const anchors: HTMLAnchorElement[] = [];
    const createElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation(
      (tagName, options) => {
        const element = createElement(tagName, options);

        if (element instanceof HTMLAnchorElement) {
          anchors.push(element);
        }

        return element;
      },
    );

    const view = renderMenu({
      cellSelectionRange: {
        columnEnd: 0,
        columnStart: 0,
        rowEnd: 1,
        rowStart: 0,
      },
    });

    dispatchPointerClick(findButtonByText("copy as"));
    await flush();

    dispatchPointerClick(findMenuItemByText("save csv"));

    expect(click).toHaveBeenCalledTimes(1);
    expect(anchors.at(-1)?.download).toBe("sql-result-selection.csv");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:selection-export");

    const blobArg = createObjectURL.mock.calls[0]?.[0];

    if (!(blobArg instanceof Blob)) {
      throw new Error("Expected selection export download to use a Blob");
    }

    expect(await blobArg.text()).toBe("id\nuser_1\nuser_2");

    view.cleanup();
  });
});
