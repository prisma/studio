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
  TemporalExecutionDebugger: (props: { onBack: () => void }) => (
    <button data-testid="back" onClick={props.onBack} />
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

  it("adds a browser history entry when the run closes", () => {
    navigation.temporalWfParam = "order-7";

    const container = render();

    act(() =>
      container.querySelector<HTMLElement>('[data-testid="back"]')!.click(),
    );

    expect(navigation.setTemporalWfParam).toHaveBeenCalledWith(null, {
      history: "push",
    });
    expect(navigation.setTemporalRunParam).toHaveBeenCalledWith(null, {
      history: "push",
    });
  });
});
