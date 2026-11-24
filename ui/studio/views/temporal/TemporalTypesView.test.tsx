import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalTypeMapNode,
  TemporalTypeMapResponse,
} from "@/data/temporal";

import { openingViewport } from "./TemporalTypeMapCanvas";
import { TemporalTypesView } from "./TemporalTypesView";

const typeMapArgs = vi.fn<(args: { workflowType: string | null }) => void>();
const setTemporalTypeParam = vi.fn();

function step(overrides: Partial<TemporalTypeMapNode>): TemporalTypeMapNode {
  return {
    failedRunCount: 0,
    failedRuns: [],
    id: "activity:chargePayment",
    kind: "activity",
    label: "chargePayment",
    retriedRunCount: 0,
    runCount: 32,
    spanCount: 32,
    waitingRunCount: 0,
    waitingRuns: [],
    ...overrides,
  };
}

const map: TemporalTypeMapResponse = {
  ageMs: 0,
  candidateCount: 400,
  candidatesComplete: true,
  during: [],
  edges: [],
  nodes: [
    step({
      failedRunCount: 2,
      failedRuns: [{ runId: "run-9", workflowId: "order-9" }],
      medianDurationMs: 497,
    }),
    step({
      id: "end:Failed",
      kind: "end",
      label: "Failed",
      runCount: 8,
      status: "Failed",
    }),
  ],
  runCount: 40,
  statusCounts: { Completed: 32, Failed: 8 },
  timersMerged: false,
  truncatedRunCount: 0,
  workflowType: "orderFulfillment",
};

const loadedFacets = {
  data: {
    complete: true,
    searchAttributes: [],
    taskQueues: [],
    workflowTypes: [
      { count: 400, name: "orderFulfillment" },
      { count: 158, name: "subscriptionBilling" },
    ],
  },
  isError: false,
  isLoading: false,
  refetch: vi.fn(),
};
const loadedMap = {
  data: map as TemporalTypeMapResponse | undefined,
  error: null as Error | null,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};
const queries = {
  facets: loadedFacets as Record<string, unknown>,
  map: loadedMap,
};

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalFacets: () => queries.facets,
  useTemporalTypeMap: (args: { workflowType: string | null }) => {
    typeMapArgs(args);

    return queries.map;
  },
}));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => ({
    createUrl: (values: Record<string, string>) =>
      `#${new URLSearchParams(values).toString()}`,
    setTemporalTypeParam,
    temporalTypeParam: null,
  }),
}));

vi.mock("../../StudioHeader", () => ({ StudioHeader: () => null }));

// The canvas needs a browser's layout; a button per node stands in for it.
vi.mock("./TemporalTypeMapCanvas", async (original) => ({
  ...(await original<typeof import("./TemporalTypeMapCanvas")>()),
  TemporalTypeMapCanvas: (props: {
    map: TemporalTypeMapResponse;
    onSelect: (id: string) => void;
  }) => (
    <>
      {props.map.nodes.map((node) => (
        <button
          key={node.id}
          data-testid={`node-${node.id}`}
          onClick={() => props.onSelect(node.id)}
        />
      ))}
    </>
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TemporalTypesView", () => {
  let root: Root | undefined;
  const onOpenExecution = vi.fn();

  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = "";
    vi.clearAllMocks();
    queries.facets = loadedFacets;
    queries.map = loadedMap;
  });

  function render() {
    const container = document.createElement("div");

    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <TemporalTypesView
          followMode="paused"
          namespace="default"
          onFollowModeChange={vi.fn()}
          onOpenExecution={onOpenExecution}
        />,
      ),
    );

    return container;
  }

  const click = (container: HTMLElement, testId: string) =>
    act(() =>
      container
        .querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
        .click(),
    );

  it("draws the type with the most runs first and says which runs the diagram is drawn from", () => {
    const container = render();

    expect(typeMapArgs).toHaveBeenLastCalledWith(
      expect.objectContaining({ workflowType: "orderFulfillment" }),
    );
    expect(
      container
        .querySelector('[data-testid="temporal-type-sample"]')!
        .textContent.replace(/\s+/g, " "),
    ).toContain("Drawn from 40 of 400 runs");

    click(container, "temporal-type-subscriptionBilling");
    expect(setTemporalTypeParam).toHaveBeenCalledWith("subscriptionBilling");
  });

  it("lists the runs in which the selected step failed, and opens one", () => {
    const container = render();

    click(container, "node-activity:chargePayment");

    const detail = container.querySelector(
      '[data-testid="temporal-type-node-detail"]',
    )!;

    expect(detail.textContent).toContain("32 of 40");
    expect(detail.textContent).toContain("497ms");
    act(() => detail.querySelector("button")!.click());
    expect(onOpenExecution).toHaveBeenCalledWith("order-9", "run-9");
  });

  it("links a closing status to every run of the type with that status", () => {
    const container = render();

    click(container, "node-end:Failed");

    const link = container.querySelector(
      '[data-testid="temporal-type-node-detail"] a',
    )!;

    expect(
      new URLSearchParams(link.getAttribute("href")!.slice(1)).get(
        "searchParam",
      ),
    ).toBe('WorkflowType = "orderFulfillment" AND ExecutionStatus = "Failed"');
  });

  it("filters the Workflow Types sidebar by name", () => {
    const container = render();
    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="temporal-type-filter"]',
    )!;
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!;

    act(() => {
      descriptor.set!.call(input, "billing");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(
      container.querySelector('[data-testid="temporal-type-orderFulfillment"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="temporal-type-subscriptionBilling"]',
      ),
    ).not.toBeNull();
  });
  it("says that the list could not load, not that no Workflow has run", () => {
    queries.facets = {
      data: undefined,
      error: new Error("upstream unavailable"),
      isError: true,
      isLoading: false,
      refetch: vi.fn(),
    };

    const text = render().textContent;

    expect(text).toContain("Could not load the Workflow Types of namespace");
    expect(text).toContain("upstream unavailable");
    expect(text).not.toContain("No Workflow has run");
    expect(text).not.toContain("Start a Workflow");
  });

  it("does not ask for a first Workflow while the list loads", () => {
    queries.facets = { data: undefined, isError: false, isLoading: true };

    expect(render().textContent).not.toContain("Start a Workflow");
  });

  it("keeps the diagram when a refresh of it fails", () => {
    queries.map = {
      ...loadedMap,
      error: new Error("upstream unavailable"),
      isError: true,
    };

    const container = render();

    expect(
      container.querySelector('[data-testid="temporal-refresh-error"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="node-activity:chargePayment"]'),
    ).not.toBeNull();
  });

  it("says that a type could not be drawn when its first request fails", () => {
    queries.map = {
      ...loadedMap,
      data: undefined,
      error: new Error("upstream unavailable"),
      isError: true,
    };

    expect(render().textContent).toContain("Could not draw Workflow Type");
  });
});

describe("openingViewport", () => {
  const view = { height: 600, width: 1000 };

  it("shows a small diagram whole, at its real size, in the middle", () => {
    expect(
      openingViewport({ height: 300, width: 400, x: 0, y: 0 }, view),
    ).toEqual({ x: 300, y: 150, zoom: 1 });
  });

  it("opens a tall diagram at a readable size with its start at the top", () => {
    const viewport = openingViewport(
      { height: 2_000, width: 400, x: 0, y: 12 },
      view,
    );

    expect(viewport.zoom).toBe(0.8);
    expect(viewport.y).toBeCloseTo(24 - 12 * 0.8);
  });
});
