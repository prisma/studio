import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemporalView } from "./TemporalView";

const navigation = {
  searchParam: "",
  setSearchParam: vi.fn(),
  setTemporalFollowParam: vi.fn(),
  setTemporalRunParam: vi.fn(),
  setTemporalSectionParam: vi.fn(),
  setTemporalWfParam: vi.fn(),
  temporalFollowParam: null,
  temporalNsParam: null,
  temporalRunParam: null as string | null,
  temporalSectionParam: null,
  temporalWfParam: null as string | null,
};

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => navigation,
}));

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalCapabilities: () => ({ data: undefined }),
  useTemporalFacets: () => ({ data: undefined }),
}));

vi.mock("./TemporalWorkflowsGrid", () => ({
  TemporalWorkflowsGrid: (props: {
    onOpenExecution: (workflowId: string, runId?: string) => void;
  }) => (
    <button
      data-testid="open"
      onClick={() => props.onOpenExecution("order-7", "run-1")}
    />
  ),
}));

vi.mock("./TemporalExecutionDebugger", () => ({
  TemporalExecutionDebugger: (props: { workflowId: string }) => (
    <div data-testid="debugger">{props.workflowId}</div>
  ),
}));

vi.mock("./TemporalWorkflowChainView", () => ({
  TemporalWorkflowChainView: (props: { workflowId: string }) => (
    <div data-testid="chain">{props.workflowId}</div>
  ),
}));

vi.mock("./TemporalWorkflowIdsView", () => ({
  TemporalWorkflowIdsView: (props: {
    onOpenWorkflowId: (workflowId: string) => void;
    search: string;
  }) => (
    <button
      data-testid="workflow-ids"
      onClick={() => props.onOpenWorkflowId("sub-cus_4920")}
    >
      {props.search}
    </button>
  ),
}));

vi.mock("./TemporalAttentionView", () => ({
  TemporalAttentionView: () => null,
}));
vi.mock("./TemporalClusterView", () => ({ TemporalClusterView: () => null }));
vi.mock("./TemporalSchedulesView", () => ({
  TemporalSchedulesView: () => null,
}));
vi.mock("./TemporalStartSheet", () => ({ TemporalStartSheet: () => null }));
vi.mock("./TemporalTaskQueuesView", () => ({
  TemporalTaskQueuesView: () => null,
}));
vi.mock("./TemporalWorkersView", () => ({ TemporalWorkersView: () => null }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TemporalView", () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = "";
    navigation.searchParam = "";
    navigation.temporalSectionParam = null;
    navigation.temporalWfParam = null;
    vi.clearAllMocks();
  });

  function render() {
    const container = document.createElement("div");

    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(<TemporalView />));

    return container;
  }

  it("adds a browser history entry when a run opens, so Back returns to the list", () => {
    const container = render();

    act(() =>
      container.querySelector<HTMLElement>('[data-testid="open"]')!.click(),
    );

    expect(navigation.setTemporalWfParam).toHaveBeenCalledWith("order-7", {
      history: "push",
    });
    expect(navigation.setTemporalRunParam).toHaveBeenCalledWith("run-1", {
      history: "push",
    });
    expect(navigation.setTemporalSectionParam).toHaveBeenCalledWith(
      "workflows",
      { history: "push" },
    );
  });

  it("renders the execution debugger when a Workflow ID is in the URL", () => {
    navigation.temporalWfParam = "order-7";

    const container = render();

    expect(
      container.querySelector('[data-testid="debugger"]')?.textContent,
    ).toBe("order-7");
  });

  it("renders the workflow chain view when temporalSection is workflow", () => {
    navigation.temporalSectionParam = "workflow" as never;
    navigation.temporalWfParam = "sub-cus_4920";

    const container = render();

    expect(container.querySelector('[data-testid="chain"]')?.textContent).toBe(
      "sub-cus_4920",
    );
  });

  it("renders the Workflow IDs list for the workflow section with no Workflow ID", () => {
    navigation.temporalSectionParam = "workflow" as never;
    navigation.searchParam = "sub-";

    const container = render();
    const list = container.querySelector<HTMLElement>(
      '[data-testid="workflow-ids"]',
    )!;

    expect(list.textContent).toBe("sub-");

    act(() => list.click());

    expect(navigation.setTemporalWfParam).toHaveBeenCalledWith("sub-cus_4920", {
      history: "push",
    });
    expect(navigation.setTemporalSectionParam).toHaveBeenCalledWith(
      "workflow",
      { history: "push" },
    );
    expect(navigation.setSearchParam).toHaveBeenCalledWith(null, {
      history: "push",
    });
  });
});
