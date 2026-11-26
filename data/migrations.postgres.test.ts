import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import {
  ledgerProbeQuery,
  ledgerQuery,
  ledgerQueryWithoutContract,
  LEGACY_PRISMA_TABLES_SCHEMA,
  PRISMA_TABLES_SCHEMA,
  PRISMA_TABLES_SCHEMAS,
  type PrismaTablesSchema,
  readRecordedSchema,
} from "./migrations";
import { createPGLiteExecutor } from "./pglite";

async function createPrismaTables(
  db: PGlite,
  schema: PrismaTablesSchema,
  currentCoreHash: string,
) {
  await db.exec(`create schema "${schema}";
    create table "${schema}".ledger (id bigint primary key, space text, migration_name text, migration_hash text, origin_core_hash text, destination_core_hash text, operations jsonb, created_at timestamptz);
    create table "${schema}".contract (core_hash text primary key, contract_json jsonb);
    insert into "${schema}".contract values ('old', '{"domain":{"models":{}}}');
    insert into "${schema}".ledger (id, space, destination_core_hash, created_at) values (1, 'app', 'old', now()), (2, 'app', '${currentCoreHash}', now()), (3, 'auth', 'old', now());`);
}

describe.each(PRISMA_TABLES_SCHEMAS)(
  "Prisma's tables in the %s schema",
  (schema) => {
    it("reads the latest app destination without falling back to an older stored contract", async () => {
      const db = new PGlite();
      try {
        await createPrismaTables(db, schema, "current");
        const executor = createPGLiteExecutor(db);
        expect(await readRecordedSchema(executor)).toMatchObject([
          null,
          { status: "missing-snapshot", coreHash: "current", contract: null },
        ]);
        await db.query(`insert into "${schema}".contract values ($1, $2)`, [
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

    it("probes for rows and reads the ledger with and without the contract store", async () => {
      const db = new PGlite();
      try {
        await createPrismaTables(db, schema, "current");
        const probe = await db.query(ledgerProbeQuery(schema));
        const withContract = await db.query<{ contract_json_after: unknown }>(
          ledgerQuery(schema),
        );
        const withoutContract = await db.query(
          ledgerQueryWithoutContract(schema),
        );
        expect(probe.rows).toEqual([{ has_rows: true }]);
        expect(withContract.rows.map((row) => row.contract_json_after)).toEqual(
          [{ domain: { models: {} } }, null, { domain: { models: {} } }],
        );
        expect(withoutContract.rows).toHaveLength(3);
      } finally {
        await db.close();
      }
    });
  },
);

it("reads from _prisma when both _prisma and prisma_contract hold Prisma's tables", async () => {
  const db = new PGlite();
  try {
    await createPrismaTables(db, LEGACY_PRISMA_TABLES_SCHEMA, "legacy");
    await createPrismaTables(db, PRISMA_TABLES_SCHEMA, "renamed");
    expect(await readRecordedSchema(createPGLiteExecutor(db))).toMatchObject([
      null,
      { coreHash: "renamed" },
    ]);
  } finally {
    await db.close();
  }
});
