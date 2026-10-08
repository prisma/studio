import { useQuery } from "@tanstack/react-query";

import { useStudio } from "../studio/context";
import { useIntrospection } from "./use-introspection";

import {
  LEDGER_QUERY,
  LEDGER_QUERY_WITHOUT_CONTRACT,
  LEDGER_PROBE_QUERY,
  parseLedgerRows,
  type StudioMigration,
} from "../../data/migrations";

/**
 * Detects whether the connected database carries a Prisma Next
 * migration ledger (`prisma_contract.ledger`) and its hash-keyed
 * contract store (`prisma_contract.contract`). Purely derived from
 * introspection data — no extra query.
 */
export function useMigrationsDetection(): {
  hasPrismaNextMigrations: boolean;
  hasContractTable: boolean;
} {
  const { data: introspection } = useIntrospection();
  const contractSchema = introspection.schemas["prisma_contract"];

  return {
    hasPrismaNextMigrations: contractSchema?.tables["ledger"] != null,
    hasContractTable: contractSchema?.tables["contract"] != null,
  };
}

export function parseLedgerProbeRows(rows: Record<string, unknown>[]): boolean {
  const value = rows[0]?.has_rows;

  return value === true || value === "t" || value === "true" || value === 1;
}

/**
 * True when the connected database has a Prisma Next migration ledger
 * with at least one row. Drives the Migrations navigation item: a
 * database without the `prisma_contract` schema, without the ledger
 * table, or with an empty ledger shows no menu entry. Resolves to
 * `false` while the probe is in flight, so the item appears only once
 * history is confirmed.
 */
export function useHasMigrationHistory(): boolean {
  const { adapter } = useStudio();
  const { hasPrismaNextMigrations } = useMigrationsDetection();

  const query = useQuery({
    enabled: hasPrismaNextMigrations,
    queryKey: ["prisma-next-migrations-probe"],
    queryFn: async ({ signal }) => {
      const [error, result] = await adapter.raw(
        { sql: LEDGER_PROBE_QUERY },
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

  return hasPrismaNextMigrations && query.data === true;
}

/**
 * Loads the Prisma Next migration history from
 * `prisma_contract.ledger`, newest first.
 */
export function useMigrations() {
  const { adapter } = useStudio();
  const { hasPrismaNextMigrations, hasContractTable } =
    useMigrationsDetection();

  const query = useQuery({
    enabled: hasPrismaNextMigrations,
    queryKey: ["prisma-next-migrations", "contract-table", hasContractTable],
    queryFn: async ({ signal }) => {
      const [error, result] = await adapter.raw(
        {
          sql: hasContractTable ? LEDGER_QUERY : LEDGER_QUERY_WITHOUT_CONTRACT,
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
