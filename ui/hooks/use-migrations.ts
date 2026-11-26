import { useQuery } from "@tanstack/react-query";

import type { Schema } from "../../data/adapter";
import {
  choosePrismaTablesSchema,
  ledgerProbeQuery,
  ledgerQuery,
  ledgerQueryWithoutContract,
  parseLedgerRows,
  type PrismaTablesSchema,
  type StudioMigration,
} from "../../data/migrations";
import { useStudio } from "../studio/context";
import { useIntrospection } from "./use-introspection";

export function detectMigrationTables(schemas: Record<string, Schema>): {
  schema: PrismaTablesSchema | null;
  hasContractTable: boolean;
} {
  const schema = choosePrismaTablesSchema(
    (candidate) => schemas[candidate]?.tables["ledger"] != null,
  );

  return {
    schema,
    hasContractTable:
      schema !== null && schemas[schema]?.tables["contract"] != null,
  };
}

/**
 * Detects whether the connected database carries a Prisma Next
 * migration ledger and its hash-keyed contract store, and in which
 * schema (`_prisma`, or `prisma_contract` before Prisma ORM 8.0.0).
 * Purely derived from introspection data — no extra query.
 */
export function useMigrationsDetection(): {
  schema: PrismaTablesSchema | null;
  hasPrismaNextMigrations: boolean;
  hasContractTable: boolean;
} {
  const { data: introspection } = useIntrospection();
  const { schema, hasContractTable } = detectMigrationTables(
    introspection.schemas,
  );

  return {
    schema,
    hasPrismaNextMigrations: schema !== null,
    hasContractTable,
  };
}

export function parseLedgerProbeRows(rows: Record<string, unknown>[]): boolean {
  const value = rows[0]?.has_rows;

  return value === true || value === "t" || value === "true" || value === 1;
}

/**
 * True when the connected database has a Prisma Next migration ledger
 * with at least one row. Drives the Migrations navigation item: a
 * database without a ledger table in either schema, or with an empty
 * ledger, shows no menu entry. Resolves to
 * `false` while the probe is in flight, so the item appears only once
 * history is confirmed.
 */
export function useHasMigrationHistory(): boolean {
  const { adapter } = useStudio();
  const { schema } = useMigrationsDetection();

  const query = useQuery({
    enabled: schema !== null,
    queryKey: ["prisma-next-migrations-probe", schema],
    queryFn: async ({ signal }) => {
      if (schema === null) {
        return false;
      }

      const [error, result] = await adapter.raw(
        { sql: ledgerProbeQuery(schema) },
        { abortSignal: signal },
      );

      if (error) {
        throw error;
      }

      return parseLedgerProbeRows(result.rows);
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 30_000,
  });

  return schema !== null && query.data === true;
}

/**
 * Loads the Prisma Next migration history from the detected schema's
 * `ledger`, newest first.
 */
export function useMigrations() {
  const { adapter } = useStudio();
  const { schema, hasPrismaNextMigrations, hasContractTable } =
    useMigrationsDetection();

  const query = useQuery({
    enabled: schema !== null,
    queryKey: [
      "prisma-next-migrations",
      schema,
      "contract-table",
      hasContractTable,
    ],
    queryFn: async ({ signal }) => {
      if (schema === null) {
        return [];
      }

      const [error, result] = await adapter.raw(
        {
          sql: hasContractTable
            ? ledgerQuery(schema)
            : ledgerQueryWithoutContract(schema),
        },
        { abortSignal: signal },
      );

      if (error) {
        throw error;
      }

      return parseLedgerRows(result.rows).reverse();
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 30_000,
  });

  const migrations: StudioMigration[] = query.data ?? [];

  return {
    ...query,
    hasPrismaNextMigrations,
    migrations,
  };
}
