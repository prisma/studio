import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemporalView } from "./TemporalView";

const navigation = {
  createUrl: (values: Record<string, string>) =>
    `#${new URLSearchParams(values).toString()}`,
  searchParam: "" as string | null,
  setSearchParam: vi.fn(),
  setSortParam: vi.fn(),
  setTemporalFollowParam: vi.fn(),
  setTemporalScheduleParam: vi.fn(),
  setTemporalSectionParam: vi.fn(),
  setTemporalStatusParam: vi.fn(),
  setTemporalTypeParam: vi.fn(),
  sortParam: null as string | null,
  temporalFollowParam: null as string | null,
  temporalNsParam: "default" as string | null,
  temporalRunParam: null as string | null,
  temporalScheduleParam: null as string | null,
  temporalSectionParam: null as string | null,
  temporalStatusParam: null as string | null,
  temporalTypeParam: null as string | null,
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
  TemporalExecutionDebugger: (props: {
    runId?: string;
    workflowId: string;
  }) => (
    <div data-run={props.runId ?? ""} data-testid="debugger">
      {props.workflowId}
    </div>
  ),
}));

vi.mock("./TemporalAttentionView", () => ({
  TemporalAttentionView: () => <div data-testid="attention" />,
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
    window.location.hash = "";
    navigation.searchParam = "";
    navigation.sortParam = null;
    navigation.temporalRunParam = null;
    navigation.temporalSectionParam = null;
    navigation.temporalStatusParam = null;
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

  it("opens a workflow at its one URL, with no screen or filter, as a new history entry", () => {
    navigation.searchParam = 'ExecutionStatus = "Failed"';

    const container = render();
    const lengthBefore = window.history.length;

    act(() =>
      container.querySelector<HTMLElement>('[data-testid="open"]')!.click(),
    );

    const params = new URLSearchParams(window.location.hash.slice(1));

    expect(Object.fromEntries(params)).toEqual({
      temporalNsParam: "default",
      temporalRunParam: "run-1",
      temporalWfParam: "order-7",
      viewParam: "temporal",
    });
    expect(window.history.length).toBe(lengthBefore + 1);
  });

  it("shows the workflow page for any Workflow ID, with or without a run", () => {
    navigation.temporalWfParam = "order-7";

    const container = render();
    const page = container.querySelector('[data-testid="debugger"]')!;

    expect(page.textContent).toBe("order-7");
    expect(page.getAttribute("data-run")).toBe("");
  });

  it("drops the screen and filter of an older workflow link in place", () => {
    navigation.temporalSectionParam = "workflow";
    navigation.temporalStatusParam = "Failed";
    navigation.temporalWfParam = "sub-cus_4920";
    navigation.temporalRunParam = "run-2";

    const container = render();
    const replace = { history: "replace" };

    expect(
      container.querySelector('[data-testid="debugger"]')!.textContent,
    ).toBe("sub-cus_4920");
    expect(navigation.setTemporalSectionParam).toHaveBeenCalledWith(
      null,
      replace,
    );
    expect(navigation.setTemporalStatusParam).toHaveBeenCalledWith(
      null,
      replace,
    );
    expect(navigation.setSearchParam).toHaveBeenCalledWith(null, replace);
  });

  it("leaves the URL of a list alone", () => {
    navigation.temporalSectionParam = "attention";

    const container = render();

    expect(container.querySelector('[data-testid="attention"]')).not.toBeNull();
    expect(navigation.setTemporalSectionParam).not.toHaveBeenCalled();
  });

  it("opens Workflows for the sections that are gone: Workflow IDs and Recent Runs", () => {
    for (const section of ["workflow", "recent"]) {
      navigation.temporalSectionParam = section;

      const container = render();

      expect(container.querySelector('[data-testid="open"]')).not.toBeNull();
      act(() => root?.unmount());
    }
  });
});
