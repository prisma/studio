import { describe, expect, it, vi } from "vitest";

import type { SequenceExecutor } from "../executor";
import { createMySQLAdapter, mockIntrospect } from "./adapter";

function createUpdates() {
  const table = mockIntrospect().schemas.studio.tables.users;

  return {
    table,
    updates: [
      {
        changes: { role: "admin" },
        row: {
          animal_id: null,
          created_at: null,
          id: 201,
          role: "member",
        },
        table,
      },
      {
        changes: { role: "member" },
        row: {
          animal_id: null,
          created_at: null,
          id: 202,
          role: "maintainer",
        },
        table,
      },
    ],
  };
}

describe("mysql-core/updateMany", () => {
  it("uses executor.executeTransaction when available", async () => {
    const execute = vi.fn();
    const executeSequence = vi.fn();
    const executeTransaction = vi.fn(
      async (
        ..._args: Parameters<NonNullable<SequenceExecutor["executeTransaction"]>>
      ) => {
        return [
          null,
          [
            [{ affectedRows: 1 }],
            [{ animal_id: null, created_at: null, id: 201, role: "admin" }],
            [{ affectedRows: 1 }],
            [{ animal_id: null, created_at: null, id: 202, role: "member" }],
          ],
        ];
      },
    );
    const adapter = createMySQLAdapter({
      executor: {
        execute,
        executeSequence,
        executeTransaction,
      } as unknown as SequenceExecutor,
    });

    if (!adapter.updateMany) {
      throw new Error("Expected adapter.updateMany to be available");
    }

    const [error, result] = await adapter.updateMany(createUpdates(), {});

    expect(error).toBeNull();
    expect(executeTransaction).toHaveBeenCalledTimes(1);
    expect(executeSequence).not.toHaveBeenCalled();
    expect(result?.queries).toHaveLength(2);
    expect(result?.rows).toEqual([
      expect.objectContaining({ id: 201, role: "admin" }),
      expect.objectContaining({ id: 202, role: "member" }),
    ]);

    expect(executeTransaction.mock.calls[0]?.[0]).toHaveLength(4);
  });

  it("falls back to executor.executeSequence when transactions are unavailable", async () => {
    const execute = vi.fn();
    const executeSequence = vi
      .fn()
      .mockResolvedValueOnce([
        [null, [{ affectedRows: 1 }]],
        [null, [{ animal_id: null, created_at: null, id: 201, role: "admin" }]],
      ])
      .mockResolvedValueOnce([
        [null, [{ affectedRows: 1 }]],
        [null, [{ animal_id: null, created_at: null, id: 202, role: "member" }]],
      ]);
    const adapter = createMySQLAdapter({
      executor: {
        execute,
        executeSequence,
      } as unknown as SequenceExecutor,
    });

    if (!adapter.updateMany) {
      throw new Error("Expected adapter.updateMany to be available");
    }

    const [error, result] = await adapter.updateMany(createUpdates(), {});

    expect(error).toBeNull();
    expect(executeSequence).toHaveBeenCalledTimes(2);
    expect(result?.queries).toHaveLength(2);
    expect(result?.rows).toEqual([
      expect.objectContaining({ id: 201, role: "admin" }),
      expect.objectContaining({ id: 202, role: "member" }),
    ]);
  });
});
