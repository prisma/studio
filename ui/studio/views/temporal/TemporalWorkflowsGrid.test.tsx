import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalFollowMode,
  TemporalWorkflowExecution,
  TemporalWorkflowStatus,
} from "@/data/temporal";

import { TemporalWorkflowsGrid } from "./TemporalWorkflowsGrid";

const navigation = {
  createUrl: (values: Record<string, string>) =>
    `#${new URLSearchParams(values).toString()}`,
  pageSizeParam: "25",
  setPageSizeParam: vi.fn(),
  setSortParam: vi.fn(),
  sortParam: null as string | null,
};

const capabilities = {
  nativeListOrder: "open-first" as
    "newest-first" | "open-first" | "workflow-id",
  persistenceStore: "sqlite",
  serverKind: "temporal",
  shardCount: 1,
};

interface WorkflowsData {
  countsByStatus: Partial<Record<TemporalWorkflowStatus, number>>;
  executions: TemporalWorkflowExecution[];
  nextPageToken?: string;
  totalCount: number;
}

const workflowsResult = {
  data: undefined as WorkflowsData | undefined,
  error: null as Error | null,
  hasCounts: true,
  isCounting: false,
  isError: false,
  isFetching: false,
  isLoading: false,
  isPlaceholderData: false,
  refetch: vi.fn(() => Promise.resolve()),
};

const useTemporalWorkflowsMock = vi.fn(
  (_args: { pageSize?: number; sort?: unknown }) => workflowsResult,
);
const startBulkJob = vi.fn(() => Promise.resolve({ id: "job-1" }));

vi.mock("@/ui/hooks/use-navigation", () => ({
  useNavigation: () => navigation,
}));

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalBulkJob: () => ({
    abort: { isPending: false, mutate: vi.fn() },
    job: undefined,
    reset: vi.fn(),
    start: { isPending: false, mutateAsync: startBulkJob },
  }),
  useTemporalCapabilities: () => ({ data: capabilities }),
  useTemporalFacets: () => ({ data: undefined }),
  useTemporalWorkflowCounts: () => ({ data: undefined }),
  useTemporalWorkflows: (args: { pageSize?: number; sort?: unknown }) =>
    useTemporalWorkflowsMock(args),
}));

vi.mock("@/ui/hooks/use-ui-state", () => ({
  useUiState: <T,>(_key: string, initial: T) => [initial, vi.fn(), vi.fn()],
}));

vi.mock("../../StudioHeader", () => ({
  StudioHeader: (props: {
    children?: React.ReactNode;
    endContent?: React.ReactNode;
    title?: string;
  }) => (
    <header>
      <h1>{props.title}</h1>
      <div>{props.children}</div>
      <div>{props.endContent}</div>
    </header>
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeRun(
  workflowId: string,
  status: TemporalWorkflowStatus = "Running",
  runId = `run-${workflowId}`,
): TemporalWorkflowExecution {
  return {
    durationMs: 1_000,
    historyLength: 10,
    historySizeBytes: 1_024,
    memo: {},
    namespace: "default",
    runId,
    searchAttributes: {},
    startTime: "2026-11-24T12:00:00.000Z",
    status,
    taskQueue: "billing",
    workflowId,
    workflowType: "subscriptionBilling",
  };
}

function failure(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

describe("TemporalWorkflowsGrid", () => {
  let root: Root;
  let container: HTMLElement;
  const onFollowModeChange = vi.fn();
  const onOpenExecution = vi.fn();
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
    capabilities.nativeListOrder = "open-first";
    navigation.sortParam = null;
    navigation.pageSizeParam = "25";
    workflowsResult.data = {
      countsByStatus: { Completed: 1, Running: 3 },
      executions: [makeRun("a"), makeRun("b"), makeRun("c", "Completed")],
      totalCount: 4,
    };
    workflowsResult.error = null;
    workflowsResult.hasCounts = true;
    workflowsResult.isCounting = false;
    workflowsResult.isError = false;
    workflowsResult.isLoading = false;
    workflowsResult.isPlaceholderData = false;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  function render(
    options: { followMode?: TemporalFollowMode; query?: string } = {},
  ) {
    act(() =>
      root.render(
        <TemporalWorkflowsGrid
          followMode={options.followMode ?? "live"}
          namespace="default"
          onFollowModeChange={onFollowModeChange}
          onImportHistory={vi.fn()}
          onOpenExecution={onOpenExecution}
          onOpenStart={vi.fn()}
          onQueryChange={vi.fn()}
          query={options.query ?? ""}
        />,
      ),
    );
  }

  const find = (testId: string) =>
    container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const click = (element: Element | null | undefined) => {
    act(() => (element as HTMLElement).click());
  };
  const press = (key: string) => {
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key }),
      );
    });
  };
  const sortedHeaders = () =>
    [...container.querySelectorAll("th")].filter((head) =>
      ["ascending", "descending"].includes(
        head.getAttribute("aria-sort") ?? "",
      ),
    );
  const lastRequest = () => useTemporalWorkflowsMock.mock.calls.at(-1)![0];
  const rowCheckbox = (workflowId: string) =>
    find(`temporal-wf-row-${workflowId}`)!.querySelector('[role="checkbox"]');
  const cursorRow = () =>
    container
      .querySelector('tr[data-focused="true"]')
      ?.getAttribute("data-testid");

  describe("on a server that lists running executions first", () => {
    it("shows no sort arrow, says what the order is and sends no sort", () => {
      render();

      expect(sortedHeaders()).toHaveLength(0);
      expect(lastRequest().sort).toBeUndefined();
      expect(find("temporal-server-order")?.textContent).toContain(
        "running first",
      );
    });

    it("sorts by start time, newest first, on the first click on Started", () => {
      render();
      click(find("temporal-sort-StartTime"));

      expect(navigation.setSortParam).toHaveBeenCalledWith("StartTime:desc");
    });

    it("asks the server for the start time sort that is in the URL", () => {
      navigation.sortParam = "StartTime:desc";
      render();

      expect(lastRequest().sort).toEqual({
        direction: "desc",
        field: "StartTime",
      });
      expect(sortedHeaders().map((head) => head.textContent)).toEqual([
        "Started",
      ]);
      expect(find("temporal-server-order")).toBeNull();
    });
  });

  it("goes to oldest first on the first click on Started when the list is already newest first", () => {
    capabilities.nativeListOrder = "workflow-id";
    render();

    expect(sortedHeaders().map((head) => head.textContent)).toEqual([
      "Started",
    ]);

    click(find("temporal-sort-StartTime"));

    expect(navigation.setSortParam).toHaveBeenCalledWith("StartTime:asc");
  });

  it("keeps the cursor on its execution when a refresh adds a row above it", () => {
    render();
    press("j");
    press("j");

    expect(cursorRow()).toBe("temporal-wf-row-b");

    workflowsResult.data = {
      ...workflowsResult.data!,
      executions: [makeRun("new"), ...workflowsResult.data!.executions],
    };
    render();

    expect(cursorRow()).toBe("temporal-wf-row-b");

    press("Enter");

    expect(onOpenExecution).toHaveBeenCalledWith("b", "run-b");
  });

  it("scrolls the cursor into view when a key moves it", () => {
    const frames: FrameRequestCallback[] = [];

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);

      return 0;
    });
    render();
    press("j");
    // The frame comes after React drew the cursor on its new row.
    act(() => frames.forEach((frame) => frame(0)));

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
    });
  });

  it("leaves the selection of every match when one row is unticked", () => {
    workflowsResult.data = { ...workflowsResult.data!, totalCount: 40 };
    render();
    click(container.querySelector('thead [role="checkbox"]'));
    click(find("temporal-select-all-matching"));

    expect(find("temporal-bulk-bar")!.textContent).toContain(
      "All 3 running matches selected",
    );

    click(rowCheckbox("a"));

    expect(find("temporal-bulk-bar")!.textContent).not.toContain("All 3");
    expect(find("temporal-bulk-bar")!.textContent).toContain("2 selected");
  });

  it("does not come back to every match when the selection was cleared with the header box", () => {
    workflowsResult.data = { ...workflowsResult.data!, totalCount: 40 };
    render();
    click(container.querySelector('thead [role="checkbox"]'));
    click(find("temporal-select-all-matching"));
    click(container.querySelector('thead [role="checkbox"]'));
    click(rowCheckbox("a"));

    expect(find("temporal-bulk-bar")!.textContent).toContain("1 selected");
  });

  it("offers no bulk action for a selection of closed executions", () => {
    render();
    click(rowCheckbox("c"));

    const bar = find("temporal-bulk-bar")!;
    const actions = [...bar.querySelectorAll("button")].filter((button) =>
      ["Signal", "Request Cancel", "Terminate"].includes(
        button.textContent ?? "",
      ),
    );

    expect(actions).toHaveLength(3);
    expect(actions.every((button) => button.disabled)).toBe(true);
    expect(bar.textContent).toContain("not running");
  });

  it("acts on the running executions of a mixed selection only", () => {
    render();
    click(rowCheckbox("a"));
    click(rowCheckbox("c"));

    const bar = find("temporal-bulk-bar")!;

    expect(bar.textContent).toContain("2 selected");
    expect(bar.textContent).toContain("1 running");

    click(
      [...bar.querySelectorAll("button")].find(
        (button) => button.textContent === "Request Cancel",
      ),
    );
    click(
      [
        ...document.querySelectorAll(
          '[role="alertdialog"] button, [role="dialog"] button',
        ),
      ].find((button) => button.textContent === "Request Cancel"),
    );

    expect(startBulkJob).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cancel",
        items: [{ runId: "run-a", workflowId: "a" }],
      }),
    );
  });

  it("keeps the rows and says so when a refresh fails", () => {
    workflowsResult.isError = true;
    workflowsResult.error = failure(503, "14 UNAVAILABLE");
    render();

    expect(find("temporal-wf-row-a")).not.toBeNull();
    expect(find("temporal-refresh-error")!.textContent).toContain(
      "14 UNAVAILABLE",
    );
    expect(find("temporal-load-error")).toBeNull();
  });

  it("does not blame the filter for a server that cannot be reached", () => {
    workflowsResult.data = undefined;
    workflowsResult.hasCounts = false;
    workflowsResult.isError = true;
    workflowsResult.error = failure(503, "14 UNAVAILABLE");
    render({ query: 'TaskQueue = "billing"' });

    expect(find("temporal-load-error")!.textContent).toContain(
      "Could not load the workflows of namespace default",
    );
    expect(container.textContent).not.toContain("could not read this filter");
    expect(find("temporal-row-range")!.textContent).toBe("");
  });

  it("explains the filter syntax when the server refuses the filter", () => {
    workflowsResult.data = undefined;
    workflowsResult.isError = true;
    workflowsResult.error = failure(400, "invalid search attribute: Foo");
    render({ query: 'Foo = "bar"' });

    expect(find("temporal-grid-error")!.textContent).toContain(
      "The server could not read this filter",
    );
    expect(find("temporal-custom-filter")!.textContent).not.toMatch(/\d/);
  });

  it("gives no total before the count of the filter is here", () => {
    workflowsResult.hasCounts = false;
    workflowsResult.isCounting = true;
    render();

    expect(find("temporal-row-range")!.textContent).toBe(
      "Rows 1–3 · counting matches…",
    );

    workflowsResult.hasCounts = true;
    workflowsResult.isCounting = false;
    render();

    expect(find("temporal-row-range")!.textContent).toBe("Rows 1–3 of 4");
  });

  it("links each Workflow ID to its run and opens it in place on a plain click", () => {
    render({ followMode: "paused" });

    const link = find("temporal-wf-row-b")!.querySelector("a")!;
    const target = new URLSearchParams(link.getAttribute("href")!.slice(1));

    expect(target.get("temporalWfParam")).toBe("b");
    expect(target.get("temporalRunParam")).toBe("run-b");
    expect(target.get("temporalFollowParam")).toBe("paused");

    click(link);

    expect(onOpenExecution).toHaveBeenCalledWith("b", "run-b");
  });

  it("tells two selected runs of one Workflow ID apart", () => {
    workflowsResult.data = {
      ...workflowsResult.data!,
      executions: [
        makeRun("nightly", "Running", "01a20d99-0d82-7222-b496-9939c1719edf"),
        makeRun("nightly", "Running", "01a20d99-0d5c-7af8-bffe-865954a459e0"),
      ],
    };
    render();

    const boxes = [...container.querySelectorAll('tbody [role="checkbox"]')];

    expect(boxes.map((box) => box.getAttribute("aria-label"))).toEqual([
      "Select nightly, run 01a20d99-0d82",
      "Select nightly, run 01a20d99-0d5c",
    ]);
  });

  it("says that refresh is paused on a page too narrow for the control, and offers to resume", () => {
    const hiddenBelow = () =>
      [...container.querySelectorAll('[role="radio"]')]
        .find((radio) => radio.textContent === "Paused")!
        .closest('[class*="@max-"][class*=":hidden"]')!.className;

    render();
    expect(hiddenBelow()).toContain("@max-2xl:hidden");
    expect(find("temporal-paused-note")).toBeNull();

    render({ followMode: "paused" });
    expect(hiddenBelow()).not.toContain("@max-2xl:hidden");
    expect(hiddenBelow()).toContain("@max-lg:hidden");
    expect(find("temporal-paused-note")!.className).toContain("@max-lg:flex");

    click(find("temporal-paused-note")!.querySelector("button"));
    expect(onFollowModeChange).toHaveBeenCalledWith("live");
  });

  it("reads the page size from the URL and writes it there", () => {
    navigation.pageSizeParam = "100";
    render();

    expect(lastRequest().pageSize).toBe(100);

    navigation.pageSizeParam = "25";
    render();

    expect(lastRequest().pageSize).toBe(50);
  });
});
