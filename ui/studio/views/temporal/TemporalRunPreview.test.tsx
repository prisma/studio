import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalExecutionDetail,
  TemporalGroupedSpan,
} from "@/data/temporal";

import { TemporalRunPreview } from "./TemporalRunPreview";

const detailMock = vi.fn<() => Record<string, unknown>>();

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalWorkflowDetail: () => detailMock(),
}));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({ createUrl: () => "#" }),
}));

vi.mock("@/ui/hooks/use-streams", () => ({
  useStreams: () => ({ streams: [] }),
}));

vi.mock("@/ui/hooks/use-ui-state", () => ({
  useUiState: <T,>(_key: string, initial: T) => [initial, vi.fn(), vi.fn()],
}));

vi.mock("../../context", () => ({
  useStudio: () => ({ hasDatabase: false }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function span(
  overrides: Partial<TemporalGroupedSpan> &
    Pick<TemporalGroupedSpan, "kind" | "label" | "startOffsetMs">,
): TemporalGroupedSpan {
  return {
    durationMs: 200,
    eventIds: [],
    id: `${overrides.label}-${overrides.startOffsetMs}`,
    startedEventId: 1,
    status: "completed",
    timestamp: "2026-11-22T10:00:00.000Z",
    ...overrides,
  };
}

function detailOf(
  overrides: Partial<TemporalExecutionDetail>,
): TemporalExecutionDetail {
  return {
    chain: {},
    execution: {
      durationMs: 3_000,
      historyLength: 12,
      historySizeBytes: 2_048,
      memo: {},
      namespace: "default",
      runId: "0a1b2c3d-run",
      searchAttributes: {},
      startTime: "2026-11-22T10:00:00.000Z",
      status: "Completed",
      taskQueue: "billing",
      workflowId: "sub-1",
      workflowType: "subscriptionBilling",
    },
    rawEvents: [],
    rawHistoryJson: { events: [] },
    spans: [],
    totalDurationMs: 3_000,
    ...overrides,
  };
}

function render(detail: TemporalExecutionDetail) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  detailMock.mockReturnValue({ data: detail, isLoading: false });

  act(() => {
    createRoot(container).render(
      <TemporalRunPreview
        execution={detail.execution}
        namespace="default"
        onClone={vi.fn()}
        onOpen={vi.fn()}
        onOpenRun={vi.fn()}
      />,
    );
  });

  return container;
}

describe("TemporalRunPreview", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows an Activity that ran three times as one step with its count", () => {
    const container = render(
      detailOf({
        result: { cyclesBilled: 3 },
        spans: [0, 1, 2].map((cycle) =>
          span({
            kind: "activity",
            label: "chargeSubscription",
            startOffsetMs: cycle * 1_000,
          }),
        ),
      }),
    );
    const steps = container.querySelector(
      '[data-testid="temporal-preview-steps"]',
    )!;

    expect(steps.textContent).toContain("chargeSubscription");
    expect(steps.textContent).toContain("×3");
    expect(steps.textContent).toContain("600ms");
    expect(container.textContent).toContain('"cyclesBilled": 3');
  });

  it("names the step that failed above the failure message", () => {
    const container = render(
      detailOf({
        failure: { message: "the bank holds all transfers", type: "Hold" },
        spans: [
          span({
            attempt: 4,
            kind: "activity",
            label: "bankTransfer",
            startOffsetMs: 0,
            status: "failed",
          }),
        ],
      }),
    );

    expect(container.textContent).toContain("bankTransfer, attempt 4");
    expect(container.textContent).toContain(
      "Hold: the bank holds all transfers",
    );
  });

  it("writes a memo value that is an object as JSON and marks an input that was not decoded", () => {
    const base = detailOf({});
    const container = render({
      ...base,
      execution: { ...base.execution, memo: { limits: { daily: 5 } } },
      input: {
        $encodedPayload: { encoding: "binary/encrypted", sizeBytes: 118 },
      },
    });

    expect(container.textContent).toContain('{"daily":5}');
    expect(container.textContent).not.toContain("[object Object]");
    expect(container.textContent).toContain(
      "Not decoded (binary/encrypted, 118 B)",
    );
  });

  it("says what a running Workflow waits on", () => {
    const base = detailOf({});
    const container = render({
      ...base,
      execution: { ...base.execution, status: "Running" },
      spans: [
        span({
          kind: "child-workflow",
          label: "Child: shipment",
          startOffsetMs: 0,
          status: "running",
        }),
      ],
    });

    expect(container.textContent).toContain("Waiting On");
    expect(container.textContent).toContain("Child: shipment");
  });
});
