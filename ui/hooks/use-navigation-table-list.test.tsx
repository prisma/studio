import {
  createCollection,
  localOnlyCollectionOptions,
} from "@tanstack/react-db";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NavigationTableNameState } from "../studio/context";
import { useNavigationTableList } from "./use-navigation-table-list";

function createNavigationTableNamesCollection() {
  return createCollection(
    localOnlyCollectionOptions<NavigationTableNameState>({
      id: "test-navigation-table-names",
      getKey(item) {
        return item.id;
      },
      initialData: [
        {
          id: "public.organizations",
          qualifiedName: "public.organizations",
          schema: "public",
          table: "organizations",
        },
        {
          id: "public.feature_flags",
          qualifiedName: "public.feature_flags",
          schema: "public",
          table: "feature_flags",
        },
        {
          id: "public.incidents",
          qualifiedName: "public.incidents",
          schema: "public",
          table: "incidents",
        },
        {
          id: "public.team_members",
          qualifiedName: "public.team_members",
          schema: "public",
          table: "team_members",
        },
        {
          id: "audit.events",
          qualifiedName: "audit.events",
          schema: "audit",
          table: "events",
        },
      ],
    }),
  );
}

interface StudioMockValue {
  navigationTableNamesCollection: ReturnType<
    typeof createNavigationTableNamesCollection
  >;
}

const useStudioMock = vi.fn<() => StudioMockValue>();

vi.mock("../studio/context", () => ({
  useStudio: () => useStudioMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useNavigationTableList", () => {
  beforeEach(() => {
    useStudioMock.mockReturnValue({
      navigationTableNamesCollection: createNavigationTableNamesCollection(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("returns schema-scoped tables sorted by table name", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let latestState: ReturnType<typeof useNavigationTableList> | undefined;

    function Harness() {
      latestState = useNavigationTableList({
        schema: "public",
        searchTerm: "",
      });

      return null;
    }

    act(() => {
      root.render(<Harness />);
    });

    await flush();

    expect(latestState?.tables.map((table) => table.table)).toEqual([
      "feature_flags",
      "incidents",
      "organizations",
      "team_members",
    ]);
    expect(latestState?.isSearchActive).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("filters with case-insensitive matches on table names from first character", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let latestState: ReturnType<typeof useNavigationTableList> | undefined;
    let searchTerm = "FeAt";

    function Harness() {
      latestState = useNavigationTableList({
        schema: "public",
        searchTerm,
      });

      return null;
    }

    act(() => {
      root.render(<Harness />);
    });

    await flush();

    expect(latestState?.tables.map((table) => table.table)).toEqual([
      "feature_flags",
    ]);
    expect(latestState?.isSearchActive).toBe(true);

    searchTerm = "i";
    act(() => {
      root.render(<Harness />);
    });

    await flush();

    expect(latestState?.tables.map((table) => table.table)).toEqual([
      "incidents",
      "organizations",
    ]);

    searchTerm = "in";
    act(() => {
      root.render(<Harness />);
    });

    await flush();

    expect(latestState?.tables.map((table) => table.table)).toEqual([
      "incidents",
    ]);

    searchTerm = "_";
    act(() => {
      root.render(<Harness />);
    });

    await flush();

    expect(latestState?.tables.map((table) => table.table)).toEqual([
      "feature_flags",
      "team_members",
    ]);

    searchTerm = "team_members";
    act(() => {
      root.render(<Harness />);
    });

    await flush();

    expect(latestState?.tables.map((table) => table.table)).toEqual([
      "team_members",
    ]);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
