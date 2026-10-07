import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

import { readRecordedSchema } from "./migrations";
import { createPGLiteExecutor } from "./pglite";

it("reads the latest app destination from Postgres without falling back to an older stored contract", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema prisma_contract;
      create table prisma_contract.ledger (id bigint primary key, space text, destination_core_hash text, created_at timestamptz);
      create table prisma_contract.contract (core_hash text primary key, contract_json jsonb);
      insert into prisma_contract.contract values ('old', '{"domain":{"models":{}}}');
      insert into prisma_contract.ledger values (1, 'app', 'old', now()), (2, 'app', 'current', now()), (3, 'auth', 'old', now());`);
    const executor = createPGLiteExecutor(db);
    expect(await readRecordedSchema(executor)).toMatchObject([
      null,
      { status: "missing-snapshot", coreHash: "current", contract: null },
    ]);
    await db.query("insert into prisma_contract.contract values ($1, $2)", [
      "current",
      { domain: { models: { User: {} } } },
    ]);
    expect(await readRecordedSchema(executor)).toMatchObject([
      null,
      {
        status: "available",
        coreHash: "current",
        contract: { domain: { models: { User: {} } } },
      },
    ]);
  } finally {
    await db.close();
  }
});
