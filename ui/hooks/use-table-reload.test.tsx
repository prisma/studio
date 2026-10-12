import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdapterError } from "../../data/adapter";
import { AbortError } from "../../data/executor";
import { useTableReload } from "./use-table-reload";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    reject = promiseReject;
    resolve = promiseResolve;
  });

  return { promise, reject, resolve };
}

function createAdapterReloadError(message: string): AdapterError {
  const error = new AdapterError(message);
  error.adapterSource = "postgresql";
  error.query = { parameters: [], sql: "select * from users" };

  return error;
}

function renderHarness(args?: {
  refetchActiveTable?: () => Promise<unknown>;
  refetchIntrospection?: () => Promise<unknown>;
  resetKey?: string;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const refetchActiveTable =
    args?.refetchActiveTable ?? vi.fn(() => Promise.resolve());
  const refetchIntrospection =
    args?.refetchIntrospection ?? vi.fn(() => Promise.resolve());
  let currentResetKey = args?.resetKey ?? "scope-initial";

  let latestResult: ReturnType<typeof useTableReload> | undefined;

  function Harness() {
    latestResult = useTableReload({
      refetchActiveTable,
      refetchIntrospection,
      resetKey: currentResetKey,
    });

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
    getLatestResult() {
      return latestResult;
    },
    refetchActiveTable,
    refetchIntrospection,
    rerender(nextArgs: { resetKey: string }) {
      currentResetKey = nextArgs.resetKey;

      act(() => {
        root.render(<Harness />);
      });
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("useTableReload", () => {
  it("awaits the introspection refetch before refetching the active table", async () => {
    const introspectionDeferred = createDeferred<void>();
    const refetchActiveTable = vi.fn(() => Promise.resolve());
    const harness = renderHarness({
      refetchActiveTable,
      refetchIntrospection: () => introspectionDeferred.promise,
    });

    let reloadPromise: Promise<void> | undefined;

    await act(async () => {
      reloadPromise = harness.getLatestResult()?.reload();
      await Promise.resolve();
    });

    expect(refetchActiveTable).not.toHaveBeenCalled();

    await act(async () => {
      introspectionDeferred.resolve();
      await reloadPromise;
    });

    expect(refetchActiveTable).toHaveBeenCalledTimes(1);
    expect(harness.getLatestResult()?.reloadError).toBeNull();

    harness.cleanup();
  });

  it("captures an active-table refetch rejection as reloadError", async () => {
    const reloadError = createAdapterReloadError("connection reset");
    const refetchActiveTable = vi.fn(() => Promise.reject(reloadError));
    const harness = renderHarness({ refetchActiveTable });

    await act(async () => {
      await harness.getLatestResult()?.reload();
    });

    const captured = harness.getLatestResult()?.reloadError;

    expect(captured).toBe(reloadError);
    expect(captured?.message).toBe("connection reset");
    expect(captured?.adapterSource).toBe("postgresql");
    expect(captured?.query).toEqual({
      parameters: [],
      sql: "select * from users",
    });

    harness.cleanup();
  });

  it("captures an introspection refetch rejection without refetching the active table", async () => {
    const reloadError = createAdapterReloadError("introspection failed");
    const refetchActiveTable = vi.fn(() => Promise.resolve());
    const refetchIntrospection = vi.fn(() => Promise.reject(reloadError));
    const harness = renderHarness({
      refetchActiveTable,
      refetchIntrospection,
    });

    await act(async () => {
      await harness.getLatestResult()?.reload();
    });

    expect(refetchActiveTable).not.toHaveBeenCalled();
    expect(harness.getLatestResult()?.reloadError).toBe(reloadError);

    harness.cleanup();
  });

  it("ignores AbortError rejections from superseded queries", async () => {
    const refetchIntrospection = vi.fn<() => Promise<unknown>>(() =>
      Promise.reject(new AbortError()),
    );
    const refetchActiveTable = vi.fn<() => Promise<unknown>>(() =>
      Promise.reject(new AbortError()),
    );
    const harness = renderHarness({
      refetchActiveTable,
      refetchIntrospection,
    });

    await act(async () => {
      await harness.getLatestResult()?.reload();
    });

    // The introspection AbortError must also short-circuit the rows refetch.
    expect(refetchActiveTable).not.toHaveBeenCalled();
    expect(harness.getLatestResult()?.reloadError).toBeNull();

    refetchIntrospection.mockImplementation(() => Promise.resolve());

    await act(async () => {
      await harness.getLatestResult()?.reload();
    });

    expect(refetchActiveTable).toHaveBeenCalledTimes(1);
    expect(harness.getLatestResult()?.reloadError).toBeNull();

    harness.cleanup();
  });

  it("clears reloadError when the resetKey changes", async () => {
    const refetchActiveTable = vi.fn(() =>
      Promise.reject(createAdapterReloadError("connection reset")),
    );
    const harness = renderHarness({
      refetchActiveTable,
      resetKey: "scope-a",
    });

    await act(async () => {
      await harness.getLatestResult()?.reload();
    });

    expect(harness.getLatestResult()?.reloadError?.message).toBe(
      "connection reset",
    );

    harness.rerender({ resetKey: "scope-b" });

    expect(harness.getLatestResult()?.reloadError).toBeNull();

    harness.cleanup();
  });

  it("clears reloadError on a subsequent successful reload", async () => {
    let shouldFail = true;
    const refetchActiveTable = vi.fn(() =>
      shouldFail
        ? Promise.reject(createAdapterReloadError("connection reset"))
        : Promise.resolve(),
    );
    const harness = renderHarness({ refetchActiveTable });

    await act(async () => {
      await harness.getLatestResult()?.reload();
    });

    expect(harness.getLatestResult()?.reloadError?.message).toBe(
      "connection reset",
    );

    shouldFail = false;

    await act(async () => {
      await harness.getLatestResult()?.reload();
    });

    expect(harness.getLatestResult()?.reloadError).toBeNull();

    harness.cleanup();
  });
});
