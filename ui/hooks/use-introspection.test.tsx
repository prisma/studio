import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Adapter,
  AdapterError,
  AdapterIntrospectResult,
  Column,
  Table,
} from "../../data/adapter";
import type { StudioEventBase } from "../studio/Studio";
import { useIntrospection } from "./use-introspection";

const useStudioMock = vi.fn<
  () => {
    adapter: Adapter;
    onEvent: (event: StudioEventBase) => void;
  }
>();

vi.mock("../studio/context", () => ({
  useStudio: useStudioMock,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createColumn(name: string): Column {
  return {
    datatype: {
      group: "string",
      isArray: false,
      isNative: true,
      name: "text",
      options: [],
      schema: "public",
    },
    defaultValue: null,
    fkColumn: null,
    fkSchema: null,
    fkTable: null,
    isAutoincrement: false,
    isComputed: false,
    isRequired: name === "id",
    name,
    nullable: name !== "id",
    pkPosition: name === "id" ? 1 : null,
    schema: "public",
    table: "users",
  };
}

function createTable(): Table {
  return {
    columns: {
      id: createColumn("id"),
      name: createColumn("name"),
    },
    name: "users",
    schema: "public",
  };
}

function createIntrospectionResult(): AdapterIntrospectResult {
  return {
    filterOperators: ["="],
    query: {
      parameters: [],
      sql: 'select "ns"."nspname" as "schema"',
    },
    schemas: {
      public: {
        name: "public",
        tables: {
          users: createTable(),
        },
      },
    },
    timezone: "UTC",
  };
}

function createIntrospectionError(message = "forced introspection failure") {
  const error = new Error(message) as AdapterError;
  error.query = {
    parameters: [],
    sql: 'select "ns"."nspname" as "schema"',
  };
  return error;
}

function createAdapterMock(args: {
  introspect: NonNullable<Adapter["introspect"]>;
}): Adapter {
  return {
    capabilities: {
      sqlDialect: "postgresql",
    },
    defaultSchema: "public",
    introspect: args.introspect,
  } as Adapter;
}

function renderHarness(args: {
  adapter: Adapter;
  onEvent?: (event: StudioEventBase) => void;
}) {
  const { adapter, onEvent = vi.fn() } = args;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient();

  useStudioMock.mockReturnValue({
    adapter,
    onEvent,
  });

  let latestState: ReturnType<typeof useIntrospection> | undefined;

  function Harness() {
    latestState = useIntrospection();
    return null;
  }

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });

  return {
    cleanup() {
      act(() => {
        root.unmount();
      });
      queryClient.clear();
      container.remove();
    },
    getLatestState() {
      return latestState;
    },
    onEvent,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(assertion: () => boolean): Promise<void> {
  const timeoutMs = 2000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) {
      return;
    }

    await flush();
  }

  throw new Error("Timed out waiting for introspection state");
}

describe("useIntrospection", () => {
  beforeEach(() => {
    useStudioMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("does not automatically retry a failed initial introspection", async () => {
    const introspect = vi.fn<NonNullable<Adapter["introspect"]>>(() =>
      Promise.resolve([createIntrospectionError()] as [AdapterError]),
    );
    const harness = renderHarness({
      adapter: createAdapterMock({ introspect }),
    });

    await waitFor(() => harness.getLatestState()?.isError === true);

    expect(introspect).toHaveBeenCalledTimes(1);
    expect(harness.getLatestState()?.errorState?.message).toBe(
      "forced introspection failure",
    );
    expect(harness.getLatestState()?.hasResolvedIntrospection).toBe(false);

    harness.cleanup();
  });

  it("keeps the last successful introspection data available after a failed refetch", async () => {
    const introspect = vi
      .fn<NonNullable<Adapter["introspect"]>>()
      .mockResolvedValueOnce([null, createIntrospectionResult()] as [
        null,
        AdapterIntrospectResult,
      ])
      .mockResolvedValueOnce([createIntrospectionError()] as [AdapterError]);
    const harness = renderHarness({
      adapter: createAdapterMock({ introspect }),
    });

    await waitFor(
      () =>
        harness.getLatestState()?.data.schemas.public?.tables.users != null &&
        harness.getLatestState()?.isSuccess === true,
    );

    await act(async () => {
      await harness.getLatestState()?.refetch();
    });

    await waitFor(() => harness.getLatestState()?.isError === true);

    expect(harness.getLatestState()?.data.schemas.public?.tables.users).toEqual(
      expect.objectContaining({
        name: "users",
        schema: "public",
      }),
    );
    expect(harness.getLatestState()?.isUsingLastKnownGoodData).toBe(true);

    harness.cleanup();
  });

  it("emits studio_launched only once across successful refetches", async () => {
    const onEvent = vi.fn<(event: StudioEventBase) => void>();
    const introspect = vi
      .fn<NonNullable<Adapter["introspect"]>>()
      .mockResolvedValueOnce([null, createIntrospectionResult()] as [
        null,
        AdapterIntrospectResult,
      ])
      .mockResolvedValueOnce([null, createIntrospectionResult()] as [
        null,
        AdapterIntrospectResult,
      ]);
    const harness = renderHarness({
      adapter: createAdapterMock({ introspect }),
      onEvent,
    });

    await waitFor(
      () =>
        harness.getLatestState()?.isSuccess === true &&
        introspect.mock.calls.length === 1,
    );

    await act(async () => {
      await harness.getLatestState()?.refetch();
    });

    await waitFor(() => introspect.mock.calls.length === 2);

    expect(
      onEvent.mock.calls.filter(
        ([event]: [StudioEventBase]) => event.name === "studio_launched",
      ),
    ).toHaveLength(1);

    harness.cleanup();
  });
});
