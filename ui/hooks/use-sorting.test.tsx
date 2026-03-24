import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Column, Table } from "../../data/adapter";
import { useSorting } from "./use-sorting";

interface NavigationMockState {
  metadata: {
    activeTable: Table | undefined;
  };
  pageIndexParam: string;
  setPageIndexParam: (value: string | null) => Promise<URLSearchParams>;
  setSortParam: (value: string | null) => Promise<URLSearchParams>;
  sortParam: string | null;
}

const useNavigationMock = vi.fn<() => NavigationMockState>();

vi.mock("./use-navigation", () => ({
  useNavigation: () => useNavigationMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latestState: ReturnType<typeof useSorting> | undefined;

  function Harness() {
    latestState = useSorting();
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    getLatestState() {
      return latestState;
    },
  };
}

async function flushMicrotasks(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

function createColumn(params: { name: string; pkPosition: number | null }): Column {
  const { name, pkPosition } = params;

  return {
    datatype: {
      group: "numeric",
      isArray: false,
      isNative: true,
      name: "int4",
      options: [],
      schema: "pg_catalog",
    },
    defaultValue: null,
    fkColumn: null,
    fkSchema: null,
    fkTable: null,
    isAutoincrement: pkPosition != null,
    isComputed: false,
    isRequired: pkPosition != null,
    name,
    nullable: pkPosition == null,
    pkPosition,
    schema: "public",
    table: "test_table",
  };
}

function createTable(columns: Column[]): Table {
  return {
    columns: Object.fromEntries(columns.map((column) => [column.name, column])),
    name: "test_table",
    schema: "public",
  };
}

describe("useSorting", () => {
  it("parses sort state from URL sort parameter", () => {
    useNavigationMock.mockReturnValue({
      metadata: { activeTable: undefined },
      pageIndexParam: "0",
      setPageIndexParam: vi.fn(),
      setSortParam: vi.fn(),
      sortParam: "id:asc,created_at:desc",
    });

    const harness = renderHarness();

    expect(harness.getLatestState()?.sortingState).toEqual([
      { column: "id", direction: "asc" },
      { column: "created_at", direction: "desc" },
    ]);

    harness.cleanup();
  });

  it("resets page index when sorting changes off a non-zero page", async () => {
    const setSortParam = vi.fn().mockResolvedValue(new URLSearchParams());
    const setPageIndexParam = vi.fn().mockResolvedValue(new URLSearchParams());

    useNavigationMock.mockReturnValue({
      metadata: { activeTable: undefined },
      pageIndexParam: "188",
      setPageIndexParam,
      setSortParam,
      sortParam: null,
    });

    const harness = renderHarness();

    await act(async () => {
      harness
        .getLatestState()
        ?.setSortingState([{ column: "id", direction: "asc" }]);
      await flushMicrotasks();
    });

    expect(setSortParam).toHaveBeenCalledWith("id:asc");
    expect(setPageIndexParam).toHaveBeenCalledWith("0");

    harness.cleanup();
  });

  it("does not force page index writes when already on the first page", async () => {
    const setSortParam = vi.fn().mockResolvedValue(new URLSearchParams());
    const setPageIndexParam = vi.fn().mockResolvedValue(new URLSearchParams());

    useNavigationMock.mockReturnValue({
      metadata: { activeTable: undefined },
      pageIndexParam: "0",
      setPageIndexParam,
      setSortParam,
      sortParam: null,
    });

    const harness = renderHarness();

    await act(async () => {
      harness
        .getLatestState()
        ?.setSortingState([{ column: "id", direction: "desc" }]);
      await flushMicrotasks();
    });

    expect(setSortParam).toHaveBeenCalledWith("id:desc");
    expect(setPageIndexParam).not.toHaveBeenCalled();

    harness.cleanup();
  });

  it("keeps sort and page params when both writes are needed", async () => {
    let hashParams = new URLSearchParams("pageIndex=188");

    const setSortParam = vi.fn((value: string | null) => {
      const snapshot = new URLSearchParams(hashParams.toString());

      return Promise.resolve().then(() => {
        if (value === null) {
          snapshot.delete("sort");
        } else {
          snapshot.set("sort", value);
        }

        hashParams = snapshot;
        return new URLSearchParams(hashParams.toString());
      });
    });

    const setPageIndexParam = vi.fn((value: string | null) => {
      const snapshot = new URLSearchParams(hashParams.toString());

      return Promise.resolve().then(() => {
        if (value === null) {
          snapshot.delete("pageIndex");
        } else {
          snapshot.set("pageIndex", value);
        }

        hashParams = snapshot;
        return new URLSearchParams(hashParams.toString());
      });
    });

    useNavigationMock.mockReturnValue({
      metadata: { activeTable: undefined },
      pageIndexParam: "188",
      setPageIndexParam,
      setSortParam,
      sortParam: null,
    });

    const harness = renderHarness();

    await act(async () => {
      harness
        .getLatestState()
        ?.setSortingState([{ column: "id", direction: "asc" }]);
      await flushMicrotasks();
    });

    expect(hashParams.get("sort")).toBe("id:asc");
    expect(hashParams.get("pageIndex")).toBe("0");

    harness.cleanup();
  });

  it("keeps the latest sort request when an earlier URL write resolves later", async () => {
    let hashParams = new URLSearchParams();
    let releaseFirstSortWrite: (() => void) | undefined;
    let sortWriteCallCount = 0;

    const setSortParam = vi.fn((value: string | null) => {
      sortWriteCallCount += 1;
      const apply = () => {
        if (value === null) {
          hashParams.delete("sort");
        } else {
          hashParams.set("sort", value);
        }

        return new URLSearchParams(hashParams.toString());
      };

      if (sortWriteCallCount === 1) {
        return new Promise<URLSearchParams>((resolve) => {
          releaseFirstSortWrite = () => resolve(apply());
        });
      }

      return Promise.resolve().then(apply);
    });
    const setPageIndexParam = vi.fn().mockResolvedValue(new URLSearchParams());

    useNavigationMock.mockReturnValue({
      metadata: { activeTable: undefined },
      pageIndexParam: "0",
      setPageIndexParam,
      setSortParam,
      sortParam: null,
    });

    const harness = renderHarness();

    await act(async () => {
      harness
        .getLatestState()
        ?.setSortingState([{ column: "created_at", direction: "asc" }]);
      await flushMicrotasks();
      harness
        .getLatestState()
        ?.setSortingState([{ column: "created_at", direction: "desc" }]);
      await flushMicrotasks();
    });

    releaseFirstSortWrite?.();

    await act(async () => {
      await flushMicrotasks(5);
    });

    expect(hashParams.get("sort")).toBe("created_at:desc");

    harness.cleanup();
  });

  it("defaults to ascending sort by single primary key when URL sort is unset", () => {
    useNavigationMock.mockReturnValue({
      metadata: {
        activeTable: createTable([
          createColumn({ name: "id", pkPosition: 1 }),
          createColumn({ name: "name", pkPosition: null }),
        ]),
      },
      pageIndexParam: "0",
      setPageIndexParam: vi.fn(),
      setSortParam: vi.fn(),
      sortParam: null,
    });

    const harness = renderHarness();

    expect(harness.getLatestState()?.sortingState).toEqual([
      { column: "id", direction: "asc" },
    ]);

    harness.cleanup();
  });

  it("defaults to ascending sort by composite primary key order when URL sort is unset", () => {
    useNavigationMock.mockReturnValue({
      metadata: {
        activeTable: createTable([
          createColumn({ name: "tenant_id", pkPosition: 1 }),
          createColumn({ name: "id", pkPosition: 2 }),
          createColumn({ name: "name", pkPosition: null }),
        ]),
      },
      pageIndexParam: "0",
      setPageIndexParam: vi.fn(),
      setSortParam: vi.fn(),
      sortParam: null,
    });

    const harness = renderHarness();

    expect(harness.getLatestState()?.sortingState).toEqual([
      { column: "tenant_id", direction: "asc" },
      { column: "id", direction: "asc" },
    ]);

    harness.cleanup();
  });

  it("does not force default sorting when the table has no primary key", () => {
    useNavigationMock.mockReturnValue({
      metadata: {
        activeTable: createTable([
          createColumn({ name: "name", pkPosition: null }),
          createColumn({ name: "title", pkPosition: null }),
        ]),
      },
      pageIndexParam: "0",
      setPageIndexParam: vi.fn(),
      setSortParam: vi.fn(),
      sortParam: null,
    });

    const harness = renderHarness();

    expect(harness.getLatestState()?.sortingState).toEqual([]);

    harness.cleanup();
  });

  it("keeps explicit URL sort when present even if the table has a primary key", () => {
    useNavigationMock.mockReturnValue({
      metadata: {
        activeTable: createTable([
          createColumn({ name: "id", pkPosition: 1 }),
          createColumn({ name: "name", pkPosition: null }),
        ]),
      },
      pageIndexParam: "0",
      setPageIndexParam: vi.fn(),
      setSortParam: vi.fn(),
      sortParam: "name:desc",
    });

    const harness = renderHarness();

    expect(harness.getLatestState()?.sortingState).toEqual([
      { column: "name", direction: "desc" },
    ]);

    harness.cleanup();
  });
});
