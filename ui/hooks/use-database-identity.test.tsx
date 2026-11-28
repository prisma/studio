import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type DatabaseIdentity,
  useDatabaseDocumentTitle,
  useDatabaseIdentity,
} from "./use-database-identity";

interface StudioMockValue {
  adapter?: { capabilities?: { sqlDialect?: string } };
  databaseLabel: string | null;
  documentTitle: boolean;
}

interface IntrospectionMockValue {
  data: { databaseName?: string };
  hasResolvedIntrospection: boolean;
}

const useStudioMock = vi.fn<() => StudioMockValue>();
const useIntrospectionMock = vi.fn<() => IntrospectionMockValue>();

vi.mock("../studio/context", () => ({
  useStudio: () => useStudioMock(),
}));

vi.mock("./use-introspection", () => ({
  useIntrospection: () => useIntrospectionMock(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let identity: DatabaseIdentity | null = null;

function Probe() {
  identity = useDatabaseIdentity();
  useDatabaseDocumentTitle();

  return null;
}

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(<Probe />);
  });
}

describe("useDatabaseIdentity", () => {
  beforeEach(() => {
    document.title = "Host page";
    identity = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useStudioMock.mockReturnValue({
      adapter: { capabilities: { sqlDialect: "postgresql" } },
      databaseLabel: null,
      documentTitle: false,
    });
    useIntrospectionMock.mockReturnValue({
      data: { databaseName: "app_dev" },
      hasResolvedIntrospection: true,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it("falls back to the database name from introspection", () => {
    render();

    expect(identity).toEqual({
      databaseName: "app_dev",
      engine: "PostgreSQL",
      label: "app_dev",
    });
  });

  it("prefers the label the embedding host passes", () => {
    useStudioMock.mockReturnValue({
      adapter: { capabilities: { sqlDialect: "postgresql" } },
      databaseLabel: "Acme / production",
      documentTitle: false,
    });

    render();

    expect(identity?.label).toBe("Acme / production");
    expect(identity?.databaseName).toBe("app_dev");
  });

  it("has nothing to show before introspection resolves and without a host label", () => {
    useIntrospectionMock.mockReturnValue({
      data: {},
      hasResolvedIntrospection: false,
    });

    render();

    expect(identity).toBeNull();
  });

  it("ignores placeholder introspection data after a failed first load", () => {
    useIntrospectionMock.mockReturnValue({
      data: { databaseName: "stale" },
      hasResolvedIntrospection: false,
    });

    render();

    expect(identity).toBeNull();
  });

  it("follows a change of database", () => {
    render();
    expect(identity?.label).toBe("app_dev");

    useIntrospectionMock.mockReturnValue({
      data: { databaseName: "app_staging" },
      hasResolvedIntrospection: true,
    });
    render();

    expect(identity?.label).toBe("app_staging");
  });
});

describe("useDatabaseDocumentTitle", () => {
  beforeEach(() => {
    document.title = "Host page";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useIntrospectionMock.mockReturnValue({
      data: { databaseName: "app_dev" },
      hasResolvedIntrospection: true,
    });
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it("leaves the tab title to the host unless asked", () => {
    useStudioMock.mockReturnValue({
      databaseLabel: null,
      documentTitle: false,
    });

    render();

    expect(document.title).toBe("Host page");
    act(() => {
      root.unmount();
    });
  });

  it("names the database in the tab title and restores the host title on unmount", () => {
    useStudioMock.mockReturnValue({
      databaseLabel: "db.example.com:5432/app",
      documentTitle: true,
    });

    render();

    expect(document.title).toBe("db.example.com:5432/app · Prisma Studio");

    act(() => {
      root.unmount();
    });

    expect(document.title).toBe("Host page");
  });

  it("restores the right title when two Studios on one page unmount in any order", () => {
    const first = createRoot(document.createElement("div"));
    const second = createRoot(document.createElement("div"));

    useStudioMock.mockReturnValue({
      databaseLabel: "first-db",
      documentTitle: true,
    });
    act(() => {
      first.render(<Probe />);
    });
    expect(document.title).toBe("first-db · Prisma Studio");

    useStudioMock.mockReturnValue({
      databaseLabel: "second-db",
      documentTitle: true,
    });
    act(() => {
      second.render(<Probe />);
    });
    expect(document.title).toBe("second-db · Prisma Studio");

    act(() => {
      first.unmount();
    });
    expect(document.title).toBe("second-db · Prisma Studio");

    act(() => {
      second.unmount();
    });
    expect(document.title).toBe("Host page");
  });

  it("updates the tab title when the database changes", () => {
    useStudioMock.mockReturnValue({
      databaseLabel: null,
      documentTitle: true,
    });

    render();
    expect(document.title).toBe("app_dev · Prisma Studio");

    useIntrospectionMock.mockReturnValue({
      data: { databaseName: "app_staging" },
      hasResolvedIntrospection: true,
    });
    render();

    expect(document.title).toBe("app_staging · Prisma Studio");
    act(() => {
      root.unmount();
    });
    expect(document.title).toBe("Host page");
  });
});
