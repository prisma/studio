import { describe, expect, it } from "vitest";

import { parseLedgerProbeRows, parseLedgerRows } from "./use-migrations";

function ledgerRow(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: 1,
    space: "app",
    migration_name: "20260702T2236_init_users",
    migration_hash: "sha256:mig",
    origin_core_hash: null,
    destination_core_hash: "sha256:c1",
    contract_json_before: null,
    contract_json_after: { marker: "after" },
    operations: [],
    created_at: "2026-07-02T22:36:00.000Z",
    ...overrides,
  };
}

describe("parseLedgerRows", () => {
  it("parses rows into migrations sorted by ledger id", () => {
    const migrations = parseLedgerRows([
      ledgerRow({ id: 2, migration_name: "20260702T2236_add_projects" }),
      ledgerRow({ id: 1 }),
    ]);

    expect(migrations.map((migration) => migration.id)).toEqual([1, 2]);
    expect(migrations[0]?.displayName).toBe("init users");
    expect(migrations[1]?.displayName).toBe("add projects");
    expect(migrations[0]?.appliedAt).toBeInstanceOf(Date);
  });

  it("labels synthesised applies without a migration name", () => {
    const migrations = parseLedgerRows([ledgerRow({ migration_name: "" })]);

    expect(migrations[0]?.displayName).toBe("Schema sync");
  });

  it("parses jsonb columns that arrive as strings", () => {
    const migrations = parseLedgerRows([
      ledgerRow({
        contract_json_after: JSON.stringify({ marker: "after" }),
        operations: JSON.stringify([
          {
            id: "op",
            label: "Create table",
            operationClass: "additive",
            execute: [{ sql: "CREATE TABLE x ()" }],
          },
        ]),
      }),
    ]);

    expect(migrations[0]?.contractAfter).toEqual({ marker: "after" });
    expect(migrations[0]?.operations[0]?.statements).toEqual([
      "CREATE TABLE x ()",
    ]);
  });

  it("flags migrations containing destructive operations", () => {
    const migrations = parseLedgerRows([
      ledgerRow({
        operations: [
          {
            id: "op",
            label: "Drop column",
            operationClass: "destructive",
            execute: [{ sql: "ALTER TABLE t DROP COLUMN c" }],
          },
        ],
      }),
    ]);

    expect(migrations[0]?.isDestructive).toBe(true);
  });

  it("takes both endpoint snapshots directly from the hash joins", () => {
    // The query joins the content-addressed contract store onto
    // origin_core_hash and destination_core_hash — no client-side chain
    // reconstruction.
    const migrations = parseLedgerRows([
      ledgerRow({ id: 1, contract_json_after: { state: "c1" } }),
      ledgerRow({
        id: 2,
        origin_core_hash: "sha256:c1",
        destination_core_hash: "sha256:c2",
        contract_json_before: { state: "c1" },
        contract_json_after: { state: "c2" },
      }),
    ]);

    expect(migrations[0]?.contractBefore).toBeNull();
    expect(migrations[1]?.contractBefore).toEqual({ state: "c1" });
    expect(migrations[1]?.contractAfter).toEqual({ state: "c2" });
  });

  it("treats an unresolved origin hash as an unknown before-state", () => {
    // Origin hash present but no contract row joined (drift, or the
    // predecessor carried no snapshot) — the join yields null.
    const migrations = parseLedgerRows([
      ledgerRow({
        id: 2,
        origin_core_hash: "sha256:unknown",
        destination_core_hash: "sha256:c2",
        contract_json_before: null,
        contract_json_after: { state: "c2" },
      }),
    ]);

    expect(migrations[0]?.contractBefore).toBeNull();
  });

  it("leaves a baseline migration's before-snapshot empty", () => {
    const migrations = parseLedgerRows([ledgerRow({})]);

    expect(migrations[0]?.contractBefore).toBeNull();
    expect(migrations[0]?.fromHash).toBeNull();
  });

  it("skips rows without a usable id", () => {
    const migrations = parseLedgerRows([ledgerRow({}), { id: "not-a-number" }]);

    expect(migrations).toHaveLength(1);
  });
});

describe("parseLedgerProbeRows", () => {
  it("accepts driver-flavored truthy values", () => {
    expect(parseLedgerProbeRows([{ has_rows: true }])).toBe(true);
    expect(parseLedgerProbeRows([{ has_rows: "t" }])).toBe(true);
    expect(parseLedgerProbeRows([{ has_rows: "true" }])).toBe(true);
    expect(parseLedgerProbeRows([{ has_rows: 1 }])).toBe(true);
  });

  it("treats false, missing, and malformed results as no history", () => {
    expect(parseLedgerProbeRows([{ has_rows: false }])).toBe(false);
    expect(parseLedgerProbeRows([{ has_rows: "f" }])).toBe(false);
    expect(parseLedgerProbeRows([{}])).toBe(false);
    expect(parseLedgerProbeRows([])).toBe(false);
  });
});
