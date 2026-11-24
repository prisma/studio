import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalScheduleDetail,
  TemporalScheduleSummary,
} from "@/data/temporal";

import {
  ScheduleFormSheet,
  TemporalSchedulesView,
} from "./TemporalSchedulesView";

const patchSchedule = vi.fn().mockResolvedValue({ ok: true });
const hour = 3_600_000;

function schedule(
  overrides: Partial<TemporalScheduleSummary>,
): TemporalScheduleSummary {
  return {
    actionCount: 0,
    cadenceSummary: "Every 2m",
    intervalSeconds: 120,
    missedCatchupWindow: 0,
    nextActionTimes: [],
    overlapPolicy: "SKIP",
    overlapSkipped: 0,
    paused: false,
    recentActions: [],
    runningWorkflows: [],
    scheduleId: "restock",
    taskQueue: "inventory",
    workflowType: "inventoryRestock",
    ...overrides,
  };
}

const loaded = {
  data: {
    schedules: [
      schedule({
        nextActionTimes: [
          new Date(Date.now() - 26 * hour).toISOString(),
          new Date(Date.now() + 2 * hour).toISOString(),
        ],
      }),
      schedule({
        cadenceSummary: "Cron 30 8 * * 1-5",
        cronExpression: "30 8 * * 1-5",
        nextActionTimes: [new Date(Date.now() + hour).toISOString()],
        paused: true,
        scheduleId: "digest",
        timezone: "Europe/Copenhagen",
        workflowType: "salesDigest",
      }),
    ],
  } as { schedules: TemporalScheduleSummary[] } | undefined,
  error: null as Error | null,
  isError: false,
  isFetching: false,
  isLoading: false,
  isPlaceholderData: false,
  refetch: vi.fn(),
};
const queries = { schedules: loaded };
const navigation = {
  setTemporalScheduleParam: vi.fn(),
  temporalScheduleParam: null as string | null,
};

vi.mock("@/ui/hooks/use-temporal", () => {
  const idle = { isPending: false, mutateAsync: vi.fn() };

  return {
    useTemporalScheduleActions: () => ({
      bulkScheduleAction: idle,
      createSchedule: idle,
      deleteSchedule: idle,
      patchSchedule: { isPending: false, mutateAsync: patchSchedule },
      previewMatchingTimes: idle,
      updateSchedule: idle,
    }),
    useTemporalScheduleDetail: () => ({ data: undefined, isLoading: false }),
    useTemporalSchedules: () => queries.schedules,
  };
});
vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => navigation,
}));
vi.mock("../../StudioHeader", () => ({
  StudioHeader: (props: {
    children: React.ReactNode;
    endContent: React.ReactNode;
  }) => (
    <div>
      {props.children}
      {props.endContent}
    </div>
  ),
}));
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

let root: Root | undefined;

function mount(element: React.ReactNode) {
  const container = document.createElement("div");

  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(element));

  return container;
}

const field = (id: string) =>
  document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;

function type(id: string, value: string) {
  const input = field(id);

  act(() => {
    // React tracks the value on the element, so the test sets it on the prototype.
    Reflect.set(Object.getPrototypeOf(input) as object, "value", value, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.clearAllMocks();
  queries.schedules = loaded;
  navigation.temporalScheduleParam = null;
});

describe("ScheduleFormSheet", () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const sheet = (editing: TemporalScheduleDetail | null, open: boolean) => (
    <ScheduleFormSheet
      editing={editing}
      knownTaskQueues={["billing", "orders"]}
      knownWorkflowTypes={["orderFulfillment"]}
      namespace="default"
      onOpenChange={vi.fn()}
      onSave={onSave}
      open={open}
      queueByWorkflowType={{ orderFulfillment: "orders" }}
    />
  );
  const submit = () =>
    document.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  it("opens an empty form for a new schedule after another schedule was edited", () => {
    mount(sheet(nightly, true));
    expect(field("sched-id").value).toBe("nightly-payouts");
    expect(field("sched-wf-type").value).toBe("merchantPayout");

    act(() => root!.render(sheet(null, false)));
    act(() => root!.render(sheet(null, true)));

    expect(field("sched-id").value).toBe("");
    expect(field("sched-notes").value).toBe("");
  });

  it("does not pair a Workflow Type with the first Task Queue in the list", () => {
    mount(sheet(null, true));

    expect(field("sched-wf-type").value).toBe("");
    expect(field("sched-tq").value).toBe("");

    type("sched-wf-type", "orderFulfillment");

    expect(field("sched-tq").value).toBe("orders");
  });

  it("refuses an interval that is not a whole number of seconds", () => {
    mount(sheet(null, true));
    type("sched-id", "every-so-often");
    type("sched-wf-type", "orderFulfillment");

    expect(submit().disabled).toBe(false);
    expect(document.body.textContent).toContain("Every 1h 0m");

    type("sched-cadence", "1.5h");

    expect(submit().disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "Enter a whole number of seconds",
    );

    type("sched-cadence", "5");

    expect(submit().disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "The shortest interval is 10 seconds",
    );
  });

  it("refuses a catch-up window that is not a number, and an empty cron expression", () => {
    mount(sheet(nightly, true));

    expect(submit().disabled).toBe(false);

    type("sched-catchup", "ten minutes");

    expect(submit().disabled).toBe(true);

    type("sched-catchup", "600");

    expect(submit().disabled).toBe(false);
    expect(document.body.textContent).toContain("10m 0s");

    type("sched-cadence", "every tuesday");

    expect(submit().disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "A cron expression has five fields",
    );
  });

  it("sends the interval as typed", async () => {
    mount(sheet(null, true));
    type("sched-id", "every-so-often");
    type("sched-wf-type", "orderFulfillment");
    type("sched-cadence", "90");

    await act(async () => {
      submit().click();
      await settle();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ intervalSeconds: 90, taskQueue: "orders" }),
    );
  });
});

describe("TemporalSchedulesView", () => {
  const view = (
    <TemporalSchedulesView
      followMode="paused"
      knownTaskQueues={["inventory"]}
      knownWorkflowTypes={["inventoryRestock"]}
      namespace="default"
      onFollowModeChange={vi.fn()}
      onOpenExecution={vi.fn()}
    />
  );
  const row = (container: HTMLElement, id: string) =>
    container.querySelector<HTMLElement>(
      `[data-testid="temporal-schedule-row-${id}"]`,
    )!;

  it("gives the next run that is still ahead, and none for a paused schedule", () => {
    const container = mount(view);

    expect(row(container, "restock").textContent).toContain("in 2h");
    expect(row(container, "restock").textContent).not.toContain("ago");
    expect(row(container, "digest").textContent).not.toContain("in 1h");
  });

  it("names the time zone a cron expression is read in", () => {
    const container = mount(view);

    expect(row(container, "digest").textContent).toContain("Europe/Copenhagen");
  });

  it("asks before it triggers a schedule from its row", async () => {
    const container = mount(view);

    act(() =>
      container
        .querySelector<HTMLElement>('[aria-label="Trigger restock now"]')!
        .click(),
    );

    expect(patchSchedule).not.toHaveBeenCalled();

    const dialog = document.querySelector('[role="alertdialog"]')!;

    expect(dialog.textContent).toContain("restock");

    await act(async () => {
      [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent === "Trigger Now")!
        .click();
      await settle();
    });

    expect(patchSchedule).toHaveBeenCalledWith({
      input: { action: "trigger" },
      scheduleId: "restock",
    });
  });

  it("says that a paused schedule starts no runs instead of listing fire times", () => {
    navigation.temporalScheduleParam = "digest";
    mount(view);

    const sheet = document.querySelector('[role="dialog"]')!;

    expect(sheet.textContent).toContain("starts no runs");
    expect(sheet.textContent).not.toContain("in 1h");
  });

  it("shows no counts before the first answer", () => {
    queries.schedules = { ...loaded, data: undefined, isLoading: true };

    expect(mount(view).textContent).not.toContain("total");
  });

  it("says what could not load when the first request fails", () => {
    queries.schedules = {
      ...loaded,
      data: undefined,
      error: new Error("upstream unavailable"),
      isError: true,
    };

    const text = mount(view).textContent ?? "";

    expect(text).toContain("Could not load the schedules of namespace");
    expect(text).not.toContain("total");
  });

  it("keeps the list when a refresh fails", () => {
    queries.schedules = {
      ...loaded,
      error: new Error("upstream unavailable"),
      isError: true,
    };

    const container = mount(view);

    expect(
      container.querySelector('[data-testid="temporal-refresh-error"]'),
    ).not.toBeNull();
    expect(row(container, "restock")).not.toBeNull();
  });
});
