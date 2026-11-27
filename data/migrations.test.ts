import { describe, expect, it, vi } from "vitest";

import type { Executor } from "./executor";
import { readRecordedSchema } from "./migrations";
import {
  LEGACY_PRISMA_TABLES_SCHEMA,
  PRISMA_TABLES_SCHEMA,
} from "./prisma-tables-schema";

const noTables = {
  current_schema_has_ledger: false,
  current_schema_has_contract: false,
  legacy_schema_has_ledger: false,
  legacy_schema_has_contract: false,
};

describe.each([
  {
    schema: PRISMA_TABLES_SCHEMA,
    tables: {
      ...noTables,
      current_schema_has_ledger: true,
      current_schema_has_contract: true,
    },
  },
  {
    schema: LEGACY_PRISMA_TABLES_SCHEMA,
    tables: {
      ...noTables,
      legacy_schema_has_ledger: true,
      legacy_schema_has_contract: true,
    },
  },
])("Prisma's tables in the $schema schema", ({ schema, tables }) => {
  it("uses the current app ledger row even when its snapshot is missing", async () => {
    const execute = vi
      .fn<Executor["execute"]>()
      .mockResolvedValueOnce([null, [tables]])
      .mockResolvedValueOnce([
        null,
        [
          {
            id: 9,
            space: "app",
            destination_core_hash: "sha256:current",
            contract_json_after: null,
          },
        ],
      ]);
    const [error, recorded] = await readRecordedSchema({
      execute: execute as Executor["execute"],
    });
    expect(error).toBeNull();
    expect(recorded).toMatchObject({
      status: "missing-snapshot",
      coreHash: "sha256:current",
      contract: null,
    });
    const sql = execute.mock.calls[1]?.[0].sql;
    expect(sql).toContain(`from "${schema}"."ledger" l`);
    expect(sql).toContain(`left join "${schema}"."contract" c`);
    expect(sql).toContain("where l.\"space\" = 'app'");
    expect(sql).toContain('order by l."id" desc limit 1');
  });

  it("reports a ledger without a contract store", async () => {
    const execute = vi.fn<Executor["execute"]>().mockResolvedValue([
      null,
      [
        {
          ...tables,
          current_schema_has_contract: false,
          legacy_schema_has_contract: false,
        },
      ],
    ]);
    expect(
      await readRecordedSchema({ execute: execute as Executor["execute"] }),
    ).toMatchObject([null, { status: "no-contract-store" }]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

it("reports no contract store when _prisma has a ledger without one, even if prisma_contract has both", async () => {
  const execute = vi.fn<Executor["execute"]>().mockResolvedValue([
    null,
    [
      {
        current_schema_has_ledger: true,
        current_schema_has_contract: false,
        legacy_schema_has_ledger: true,
        legacy_schema_has_contract: true,
      },
    ],
  ]);
  expect(
    await readRecordedSchema({ execute: execute as Executor["execute"] }),
  ).toMatchObject([null, { status: "no-contract-store" }]);
  expect(execute).toHaveBeenCalledTimes(1);
});

it("does not query absent migration tables", async () => {
  const execute = vi
    .fn<Executor["execute"]>()
    .mockResolvedValue([null, [noTables]]);
  expect(
    await readRecordedSchema({ execute: execute as Executor["execute"] }),
  ).toEqual([
    null,
    { status: "no-ledger", contract: null, coreHash: null, appliedAt: null },
  ]);
  expect(execute).toHaveBeenCalledTimes(1);
});

it("keeps database failures distinct from an empty schema", async () => {
  const error = new Error("Connection unavailable");
  const execute = vi.fn<Executor["execute"]>().mockResolvedValue([error]);
  expect(
    await readRecordedSchema({ execute: execute as Executor["execute"] }),
  ).toEqual([error]);
});
