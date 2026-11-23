import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemporalInteractPanel } from "./TemporalInteractPanel";

const queryWorkflow = vi.fn().mockResolvedValue({
  durationMs: 12,
  result: { ok: true },
});
const signalWorkflow = vi.fn().mockResolvedValue({ ok: true });
const updateWorkflow = vi.fn().mockResolvedValue({
  durationMs: 15,
  outcome: "completed",
  result: { ok: true },
  updateId: "u1",
});

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalActions: () => ({
    queryWorkflow: { mutateAsync: queryWorkflow },
    signalWorkflow: { mutateAsync: signalWorkflow },
    updateWorkflow: { mutateAsync: updateWorkflow },
  }),
  useTemporalWorkflowMetadata: () => ({
    data: { queries: [], signals: [], updates: [] },
    isLoading: false,
  }),
}));

vi.mock("@/ui/hooks/use-ui-state", async () => {
  const React = await import("react");
  return {
    useUiState: <T,>(_key: string, initial: T) => {
      const [state, setState] = React.useState(initial);
      return [state, setState, vi.fn()] as const;
    },
  };
});

vi.mock("./TemporalJsonEditor", () => ({
  TemporalJsonEditor: (props: {
    ariaLabel: string;
    id: string;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label={props.ariaLabel}
      id={props.id}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TemporalInteractPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("hides Signal and Update controls in the custom form on closed runs", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <TemporalInteractPanel
          isRunning={false}
          namespace="default"
          runId="run-1"
          spans={[]}
          workflowId="ord-1"
          workflowType="ChargeOrder"
        />,
      );
    });

    expect(container.textContent).toContain("This run is closed.");
    expect(
      container.querySelector('[aria-label="Interaction type"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="temporal-interact-submit"]')!
        .textContent,
    ).toContain("Run Query");

    act(() => root.unmount());
  });

  it("remembers custom interactions per workflow type", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <TemporalInteractPanel
          isRunning={true}
          namespace="default"
          runId="run-1"
          spans={[]}
          workflowId="xfer-1"
          workflowType="MoneyTransfer"
        />,
      );
    });

    const input = container.querySelector<HTMLInputElement>(
      "#temporal-interact-name",
    )!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;

    await act(async () => {
      setter.call(input, "transferStatus");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="temporal-interact-submit"]',
        )!
        .click();
    });

    expect(queryWorkflow).toHaveBeenCalledWith({
      args: [],
      queryType: "transferStatus",
      runId: "run-1",
      workflowId: "xfer-1",
    });
    expect(
      container.querySelector('[data-testid="temporal-interact-recent"]')!
        .textContent,
    ).toContain("transferStatus");

    act(() => root.unmount());
  });
});
