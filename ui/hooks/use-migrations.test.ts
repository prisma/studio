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
    contract_json: { marker: "after" },
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
        contract_json: JSON.stringify({ marker: "after" }),
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

  it("derives each before-snapshot from the predecessor's after-snapshot", () => {
    const migrations = parseLedgerRows([
      ledgerRow({ id: 1, contract_json: { state: "c1" } }),
      ledgerRow({
        id: 2,
        origin_core_hash: "sha256:c1",
        destination_core_hash: "sha256:c2",
        contract_json: { state: "c2" },
      }),
    ]);

    expect(migrations[0]?.contractBefore).toBeNull();
    expect(migrations[1]?.contractBefore).toEqual({ state: "c1" });
    expect(migrations[1]?.contractAfter).toEqual({ state: "c2" });
  });

  it("leaves before empty when the hash chain is broken", () => {
    // Row 2's origin doesn't match row 1's destination (out-of-band
    // drift) — showing row 1's contract as the baseline would be wrong.
    const migrations = parseLedgerRows([
      ledgerRow({ id: 1, contract_json: { state: "c1" } }),
      ledgerRow({
        id: 2,
        origin_core_hash: "sha256:not-c1",
        destination_core_hash: "sha256:c2",
        contract_json: { state: "c2" },
      }),
    ]);

    expect(migrations[1]?.contractBefore).toBeNull();
  });

  it("chains per contract space, not across spaces", () => {
    const migrations = parseLedgerRows([
      ledgerRow({ id: 1, space: "app", contract_json: { state: "app-c1" } }),
      ledgerRow({
        id: 2,
        space: "ext",
        destination_core_hash: "sha256:ext-c1",
        contract_json: { state: "ext-c1" },
      }),
      ledgerRow({
        id: 3,
        space: "app",
        origin_core_hash: "sha256:c1",
        destination_core_hash: "sha256:c2",
        contract_json: { state: "app-c2" },
      }),
    ]);

    expect(migrations[2]?.contractBefore).toEqual({ state: "app-c1" });
    expect(migrations[1]?.contractBefore).toBeNull();
  });

  it("treats a snapshot-less predecessor as an unknown before-state", () => {
    const migrations = parseLedgerRows([
      ledgerRow({ id: 1, contract_json: null }),
      ledgerRow({
        id: 2,
        origin_core_hash: "sha256:c1",
        destination_core_hash: "sha256:c2",
        contract_json: { state: "c2" },
      }),
    ]);

    expect(migrations[1]?.contractBefore).toBeNull();
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
