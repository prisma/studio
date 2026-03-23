import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTanStackDbMutationBurstGuard,
  instrumentTanStackCollectionMutations,
} from "./tanstack-db-mutation-guard";

describe("createTanStackDbMutationBurstGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reports a violation when mutations exceed the per-tick threshold", () => {
    const violations: string[] = [];
    const guard = createTanStackDbMutationBurstGuard({
      enabled: true,
      maxMutationsPerTick: 2,
      mode: "warn",
      onViolation: (details) => {
        violations.push(details.message);
      },
    });

    guard.recordMutation({
      collectionName: "rows:public.team_members",
      method: "update",
    });
    guard.recordMutation({
      collectionName: "rows:public.team_members",
      method: "update",
    });
    guard.recordMutation({
      collectionName: "rows:public.team_members",
      method: "update",
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("TanStack DB");
    expect(violations[0]).toContain("event-loop tick");
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("resets counters on the next tick", () => {
    const violations: string[] = [];
    const guard = createTanStackDbMutationBurstGuard({
      enabled: true,
      maxMutationsPerTick: 2,
      mode: "warn",
      onViolation: (details) => {
        violations.push(details.message);
      },
    });

    guard.recordMutation({
      collectionName: "rows:public.team_members",
      method: "update",
    });
    guard.recordMutation({
      collectionName: "rows:public.team_members",
      method: "update",
    });
    guard.recordMutation({
      collectionName: "rows:public.team_members",
      method: "update",
    });

    vi.runOnlyPendingTimers();

    guard.recordMutation({
      collectionName: "rows:public.team_members",
      method: "update",
    });
    guard.recordMutation({
      collectionName: "rows:public.team_members",
      method: "update",
    });

    expect(violations).toHaveLength(1);
  });

  it("throws in strict mode", () => {
    const guard = createTanStackDbMutationBurstGuard({
      enabled: true,
      maxMutationsPerTick: 1,
      mode: "throw",
    });

    guard.recordMutation({
      collectionName: "rows:public.team_members",
      method: "update",
    });

    expect(() =>
      guard.recordMutation({
        collectionName: "rows:public.team_members",
        method: "update",
      }),
    ).toThrowError(/TanStack DB/);
  });
});

describe("instrumentTanStackCollectionMutations", () => {
  it("instruments insert/update/delete and forwards calls", () => {
    const calls: string[] = [];
    const collection = {
      insert: () => {
        calls.push("insert");
      },
      update: () => {
        calls.push("update");
      },
      delete: () => {
        calls.push("delete");
      },
    };
    const guard = createTanStackDbMutationBurstGuard({
      enabled: true,
      maxMutationsPerTick: 100,
      mode: "warn",
    });

    const instrumented = instrumentTanStackCollectionMutations(collection, {
      collectionName: "studio-local-ui-state",
      guard,
    });

    instrumented.insert();
    instrumented.update();
    instrumented.delete();

    expect(calls).toEqual(["insert", "update", "delete"]);
  });

  it("does not double-wrap an already instrumented collection", () => {
    const collection = {
      insert: () => undefined,
      update: () => undefined,
      delete: () => undefined,
    };
    const guard = createTanStackDbMutationBurstGuard({
      enabled: true,
      maxMutationsPerTick: 1,
      mode: "throw",
    });

    const once = instrumentTanStackCollectionMutations(collection, {
      collectionName: "studio-local-ui-state",
      guard,
    });
    const twice = instrumentTanStackCollectionMutations(once, {
      collectionName: "studio-local-ui-state",
      guard,
    });

    expect(() => twice.insert()).not.toThrow();
    expect(() => twice.insert()).toThrowError(/TanStack DB/);
  });
});
