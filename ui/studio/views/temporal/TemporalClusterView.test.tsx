import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TemporalClusterOverview } from "@/data/temporal";

import {
  CLUSTER_HEALTH_STATES,
  SHARD_LIFECYCLE_STATES,
} from "./temporal-cluster-health";
import { TemporalClusterView } from "./TemporalClusterView";

const mockOverview: TemporalClusterOverview = {
  admissionAvailable: true,
  cell: {},
  dims: [],
  headroom: { binding: "cpu", overall10s: 0.92 },
  health: { reasons: [], state: "ok", tags: [] },
  history: [],
  info: {
    authMode: "token",
    listen: "127.0.0.1:7233",
    namespaces: 1,
    phase: "serving",
    placementVersion: 1,
    projects: 1,
    revision: "abc123",
    schemaVersion: 1,
    shardCount: 1,
    slatedbRev: "0.1",
    storeKind: "s3",
    temporalApiRelease: "1.26",
    tlsEnabled: false,
    uptimeSeconds: 3600,
    version: "0.1.0",
  },
  memory: {
    budgetBytes: 700_000_000,
    projectedBytes: 128_000_000,
    rssBytes: 128_000_000,
  },
  placement: {},
  readyz: { phase: "serving", ready: true, subsystems: { storage: "ok" } },
  shards: [
    {
      admissionMode: { batch: "open", existing: "open", new: "open" },
      backlog: false,
      committerBusy: 0.05,
      compactionState: "idle",
      durableSeq: 42,
      effectLagMs: 1,
      generation: 0,
      health: "ok",
      healthReasons: [],
      historyEventsPerS: 10,
      homeEntries: 100,
      hot: false,
      id: 0,
      l0Ssts: 1,
      lifecycle: "serving",
      of: 1,
      placementVersion: 1,
      progressDelayMs: 0.5,
      rateLimitPerS: null,
      retentionLagS: 0,
      runsClosedPerS: 1,
      runsOpenedPerS: 1,
      storageBytes: 1024,
      timerLagMs: 0,
      unflushedBytes: 512,
      walPutsPerS: 2,
    },
  ],
  storageActiveBytes: 1024,
  window: "10s",
  workerHint: { matcherOldestReadyMs: 0 },
};

vi.mock("../../StudioHeader", () => ({
  StudioHeader: (props: { title: string }) => <div>{props.title}</div>,
}));

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalClusterActions: () => ({
    drainTraces: { isPending: false, mutateAsync: vi.fn() },
    handoffShard: { isPending: false, mutateAsync: vi.fn() },
    liftAdmission: { isPending: false, mutateAsync: vi.fn() },
    setAdmission: { isPending: false, mutateAsync: vi.fn() },
  }),
  useTemporalClusterOverview: () => ({
    data: overviewMock(),
    dataUpdatedAt: Date.now() - 90_000,
    error: errorMock(),
    isError: errorMock() !== null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useTemporalClusterTraces: () => ({
    data: { capacity: 4096, traces: tracesMock() },
    refetch: vi.fn(),
  }),
}));

const overviewMock = vi.fn<() => TemporalClusterOverview | undefined>(
  () => mockOverview,
);
const errorMock = vi.fn<() => Error | null>(() => null);
const tracesMock = vi.fn<() => Array<Record<string, unknown>>>(() => []);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TemporalClusterView shard state popup", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    overviewMock.mockImplementation(() => mockOverview);
    errorMock.mockReturnValue(null);
    tracesMock.mockReturnValue([]);
  });

  function renderView() {
    act(() => {
      root.render(
        <TemporalClusterView
          followMode="paused"
          onFollowModeChange={vi.fn()}
          onOpenExecution={vi.fn()}
        />,
      );
    });
  }

  function typeInto(id: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.bind(input);

    act(() => {
      setValue(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const applyButton = () =>
    container.querySelector<HTMLButtonElement>(
      '[data-testid="temporal-admission-apply-btn"]',
    )!;

  it("explains the server's trouble once, not under every shard", () => {
    const shard = mockOverview.shards[0]!;

    overviewMock.mockReturnValue({
      ...mockOverview,
      health: {
        reasons: [{ signal: "headroom", unit: "share", value: 0.12 }],
        state: "busy",
        tags: ["worker_shortage"],
      },
      shards: [
        {
          ...shard,
          health: "busy",
          healthReasons: [
            { shard: 0, signal: "progress_sojourn", unit: "ms", value: 7.13 },
          ],
        },
      ],
    });
    renderView();

    const note = container.querySelector(
      '[data-testid="temporal-cluster-health-note"]',
    )!;
    const shardState = container.querySelector(
      '[data-testid="temporal-shard-state-0"]',
    )!;

    expect(note.textContent).toContain("Tasks wait for Workers.");
    expect(note.textContent).toContain("headroom 12%");
    expect(shardState.textContent).not.toContain("Tasks wait for Workers.");
    expect(shardState.textContent).toContain("progress_sojourn");
  });

  it("offers no shard handoff on a single node and says why", () => {
    renderView();

    expect(container.textContent).not.toContain("Hand Off");
    expect(container.textContent).toContain("single node, not available");
  });

  it("offers a handoff for each shard of a cell with several servers", () => {
    overviewMock.mockReturnValue({
      ...mockOverview,
      info: { ...mockOverview.info, placementVersion: 2 },
    });
    renderView();

    expect(
      container.querySelector('button[aria-label="Hand off shard/0"]')!
        .textContent,
    ).toBe("Hand Off");
  });

  it("refuses a hold that lasts longer than the server allows", () => {
    renderView();
    expect(applyButton().disabled).toBe(false);

    typeInto("adm-ttl", "99999");

    expect(applyButton().disabled).toBe(true);
    expect(container.querySelector("#adm-ttl-error")!.textContent).toBe(
      "Enter 1 to 3600 whole seconds.",
    );
  });

  it("refuses an empty rate instead of applying another one", () => {
    renderView();
    typeInto("adm-rate", "");

    expect(applyButton().disabled).toBe(true);
    expect(container.querySelector("#adm-rate-error")!.textContent).toBe(
      "Enter a rate above 0.",
    );
  });

  it("shows the fields the server reports for a sampled trace", () => {
    tracesMock.mockReturnValue([
      { effect_ms: 0.4, workflow_id: "order-1", write_ms: 1.2 },
    ]);
    renderView();

    expect(container.textContent).toContain("order-1");
    expect(container.textContent).toContain("effect_ms 0.4 · write_ms 1.2");
  });

  it("says when the data was read and that refresh is paused", () => {
    renderView();

    expect(
      container.querySelector('[data-testid="temporal-cluster-as-of"]')!
        .textContent,
    ).toBe("As of 1m ago · Paused");
  });

  it("says that the load failed, with the server's message", () => {
    overviewMock.mockReturnValue(undefined);
    errorMock.mockReturnValue(new Error("unauthenticated"));
    renderView();

    const alert = container.querySelector('[role="alert"]')!;

    expect(alert.textContent).toContain(
      "Could not load the cluster diagnostics",
    );
    expect(alert.textContent).toContain("unauthenticated");
  });

  it("keeps the diagnostics on screen when a refresh fails", () => {
    errorMock.mockReturnValue(new Error("admin API timed out"));
    renderView();

    expect(
      container.querySelector('[data-testid="temporal-shard-row-0"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="temporal-refresh-error"]')!
        .textContent,
    ).toContain("admin API timed out");
  });

  it("shows all shard lifecycle and health states with descriptions when hovering or focusing the shard state", () => {
    act(() => {
      root.render(
        <TemporalClusterView
          followMode="paused"
          onFollowModeChange={vi.fn()}
          onOpenExecution={vi.fn()}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="temporal-shard-state-trigger-0"]',
    );
    expect(trigger).not.toBeNull();

    act(() => {
      trigger!.focus();
    });

    const popup = document.body.querySelector(
      '[data-testid="temporal-shard-state-popup-0"]',
    );
    expect(popup).not.toBeNull();

    const text = popup!.textContent ?? "";
    for (const state of SHARD_LIFECYCLE_STATES) {
      expect(text).toContain(state.label);
      expect(text).toContain(state.meaning);
    }
    for (const state of CLUSTER_HEALTH_STATES) {
      expect(text).toContain(state.label);
      expect(text).toContain(state.meaning);
    }

    const currentItems = [
      ...popup!.querySelectorAll(':scope > div [data-current="true"]'),
    ];
    expect(currentItems).toHaveLength(2);
    expect(currentItems[0]!.textContent).toContain("Serving");
    expect(currentItems[1]!.textContent).toContain("Ok");
  });
});
