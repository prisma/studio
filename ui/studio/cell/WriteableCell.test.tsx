import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WriteableCell } from "./WriteableCell";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete document.body.dataset.studioSuppressCellOpenUntil;
});

describe("WriteableCell", () => {
  it("requests opening the editor on primary click when closed", () => {
    const onRequestOpen = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <table>
          <tbody>
            <tr>
              <WriteableCell
                cellComponent={<span>Acme Labs</span>}
                inputComponent={<div data-testid="editor-input">editor</div>}
                isEditorOpen={false}
                linkComponent={null}
                onRequestOpen={onRequestOpen}
              />
            </tr>
          </tbody>
        </table>,
      );
    });

    const cell = container.querySelector("td");

    if (!(cell instanceof HTMLTableCellElement)) {
      throw new Error("Could not find writable cell");
    }

    act(() => {
      cell.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    expect(onRequestOpen).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="editor-input"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("does not request opening while interaction suppression is active", () => {
    const onRequestOpen = vi.fn();
    document.body.dataset.studioSuppressCellOpenUntil = String(
      Date.now() + 5_000,
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <table>
          <tbody>
            <tr>
              <WriteableCell
                cellComponent={<span>Acme Labs</span>}
                inputComponent={<div data-testid="editor-input">editor</div>}
                isEditorOpen={false}
                linkComponent={null}
                onRequestOpen={onRequestOpen}
              />
            </tr>
          </tbody>
        </table>,
      );
    });

    const cell = container.querySelector("td");

    if (!(cell instanceof HTMLTableCellElement)) {
      throw new Error("Could not find writable cell");
    }

    act(() => {
      cell.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    expect(onRequestOpen).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("renders editor input only for the active/open writable cell", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <table>
          <tbody>
            <tr>
              <WriteableCell
                cellComponent={<span>Acme Labs</span>}
                inputComponent={<div data-testid="editor-input">editor</div>}
                isEditorOpen={true}
                linkComponent={null}
              />
            </tr>
          </tbody>
        </table>,
      );
    });

    await flushMicrotasks();

    expect(
      document.querySelector('[data-testid="editor-input"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
