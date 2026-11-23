import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TemporalScheduleDetail } from "@/data/temporal";

import { ScheduleFormSheet } from "./TemporalSchedulesView";

vi.mock("@/ui/hooks/use-temporal", () => ({}));
vi.mock("@/ui/hooks/use-navigation", () => ({ useNavigation: () => ({}) }));
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

const nightly = {
  cronExpression: "0 2 * * *",
  notes: "Owned by billing",
  overlapPolicy: "BUFFER_ONE",
  scheduleId: "nightly-payouts",
  taskQueue: "billing",
  workflowArgs: [{ merchant: "mch_001" }],
  workflowType: "merchantPayout",
} as TemporalScheduleDetail;

describe("ScheduleFormSheet", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens an empty form for a new schedule after another schedule was edited", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const sheet = (editing: TemporalScheduleDetail | null, open: boolean) => (
      <ScheduleFormSheet
        editing={editing}
        knownTaskQueues={["orders"]}
        knownWorkflowTypes={["orderFulfillment"]}
        namespace="default"
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        open={open}
      />
    );
    const field = (id: string) =>
      document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;

    act(() => root.render(sheet(nightly, true)));
    expect(field("sched-id").value).toBe("nightly-payouts");
    expect(field("sched-wf-type").value).toBe("merchantPayout");

    act(() => root.render(sheet(null, false)));
    act(() => root.render(sheet(null, true)));

    expect(field("sched-id").value).toBe("");
    expect(field("sched-wf-type").value).toBe("orderFulfillment");
    expect(field("sched-tq").value).toBe("orders");
    expect(field("sched-notes").value).toBe("");

    act(() => root.unmount());
  });
});
