import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RequestsView } from "./RequestsView";

const uiStateValues = new Map<string, unknown>();

vi.mock("../../StudioHeader", () => ({
  StudioHeader: () => <div data-testid="studio-header">Studio header</div>,
}));

vi.mock("../../../hooks/use-ui-state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useUiState: <T,>(key: string | undefined, initialValue: T) => {
      const [value, setValue] = React.useState<T>(() => {
        if (key && !uiStateValues.has(key)) {
          uiStateValues.set(key, initialValue);
        }

        return key && uiStateValues.has(key)
          ? (uiStateValues.get(key) as T)
          : initialValue;
      });

      const setSharedValue = (updater: T | ((previous: T) => T)) => {
        setValue((previous) => {
          const nextValue =
            typeof updater === "function"
              ? (updater as (previous: T) => T)(previous)
              : updater;

          if (key) {
            uiStateValues.set(key, nextValue);
          }

          return nextValue;
        });
      };

      return [value, setSharedValue, vi.fn()] as const;
    },
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function click(element: Element) {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("RequestsView", () => {
  afterEach(() => {
    vi.clearAllMocks();
    uiStateValues.clear();
    document.body.innerHTML = "";
  });

  it("renders dummy requests newest first with the required columns", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<RequestsView />);
    });

    expect(container.textContent).toContain("Timestamp");
    expect(container.textContent).toContain("Service");
    expect(container.textContent).toContain("Path");
    expect(container.textContent).toContain("Message");
    expect(container.textContent).toContain("Duration");

    const rows = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-testid^='request-row-']",
      ),
    ];

    expect(rows).toHaveLength(5);
    expect(rows[0]?.textContent).toContain("/api/invoices");
    expect(rows[0]?.textContent).toContain("identity");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("expands a request in place and switches between trace and logs", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<RequestsView />);
    });

    const firstRequest = container.querySelector<HTMLElement>(
      "[data-testid='request-row-demo-app-req-00000999']",
    );

    expect(firstRequest).not.toBeNull();

    act(() => {
      click(firstRequest!);
    });

    expect(container.textContent).toContain("Trace timeline");
    expect(container.textContent).toContain("prisma:engine:db_query");
    expect(container.textContent).toContain("api.stripe.com");

    const logsTrigger = container.querySelector<HTMLElement>(
      "[data-testid='request-detail-logs-trigger']",
    );

    expect(logsTrigger).not.toBeNull();

    act(() => {
      click(logsTrigger!);
    });

    expect(container.textContent).toContain("Request completed");
    expect(container.textContent).toContain(
      '"traceId": "demo-app-trace-000249"',
    );
    expect(container.textContent).toContain('"fingerprint"');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
