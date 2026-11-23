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
    data: mockOverview,
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useTemporalClusterTraces: () => ({
    data: { capacity: 4096, traces: [] },
    refetch: vi.fn(),
  }),
}));

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
