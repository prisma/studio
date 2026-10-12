import { expect, it, vi } from "vitest";

import type { Executor } from "./executor";
import { readRecordedSchema } from "./migrations";

it("uses the current app ledger row even when its snapshot is missing", async () => {
  const execute = vi
    .fn<Executor["execute"]>()
    .mockResolvedValueOnce([null, [{ has_ledger: true, has_contract: true }]])
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
  const [error, schema] = await readRecordedSchema({
    execute: execute as Executor["execute"],
  });
  expect(error).toBeNull();
  expect(schema).toMatchObject({
    status: "missing-snapshot",
    coreHash: "sha256:current",
    contract: null,
  });
  expect(execute.mock.calls[1]?.[0].sql).toContain("where l.\"space\" = 'app'");
  expect(execute.mock.calls[1]?.[0].sql).toContain(
    'order by l."id" desc limit 1',
  );
});

it("does not query absent migration tables", async () => {
  const execute = vi
    .fn<Executor["execute"]>()
    .mockResolvedValue([null, [{ has_ledger: false, has_contract: false }]]);
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
