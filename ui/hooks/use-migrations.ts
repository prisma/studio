import { useQuery } from "@tanstack/react-query";

import { useStudio } from "../studio/context";
import { useIntrospection } from "./use-introspection";

const LEDGER_QUERY = `
  select
    "id", "space", "migration_name", "migration_hash",
    "origin_core_hash", "destination_core_hash",
    "contract_json_before", "contract_json_after",
    "operations", "created_at"
  from "prisma_contract"."ledger"
  order by "id" asc
`;

export interface StudioMigrationOperationStep {
  sql: string;
}

export interface StudioMigrationOperation {
  id: string;
  label: string;
  operationClass: string;
  statements: string[];
}

export interface StudioMigration {
  id: number;
  space: string;
  /** Migration directory name; empty for synthesised (db init/update) applies. */
  name: string;
  displayName: string;
  hash: string;
  fromHash: string | null;
  toHash: string;
  appliedAt: Date | null;
  operations: StudioMigrationOperation[];
  contractBefore: unknown;
  contractAfter: unknown;
  isDestructive: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonish(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toDisplayName(migrationName: string): string {
  if (migrationName.length === 0) {
    return "Schema sync";
  }

  const slug = migrationName.replace(/^\d{8}T\d{4}_/, "");

  return slug.length > 0 ? slug.replace(/_/g, " ") : migrationName;
}

function parseOperations(value: unknown): StudioMigrationOperation[] {
  const parsed = parseJsonish(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const operations: StudioMigrationOperation[] = [];

  for (const operation of parsed) {
    if (!isRecord(operation)) {
      continue;
    }

    const statements: string[] = [];

    if (Array.isArray(operation.execute)) {
      for (const step of operation.execute) {
        if (isRecord(step) && typeof step.sql === "string") {
          statements.push(step.sql);
        }
      }
    }

    operations.push({
      id: typeof operation.id === "string" ? operation.id : "",
      label: typeof operation.label === "string" ? operation.label : "",
      operationClass:
        typeof operation.operationClass === "string"
          ? operation.operationClass
          : "additive",
      statements,
    });
  }

  return operations;
}

function parseAppliedAt(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function parseLedgerRows(
  rows: Record<string, unknown>[],
): StudioMigration[] {
  const migrations: StudioMigration[] = [];

  for (const row of rows) {
    const idValue = row.id;
    const id =
      typeof idValue === "number"
        ? idValue
        : typeof idValue === "string" || typeof idValue === "bigint"
          ? Number(idValue)
          : Number.NaN;

    if (!Number.isFinite(id)) {
      continue;
    }

    const name =
      typeof row.migration_name === "string" ? row.migration_name : "";
    const operations = parseOperations(row.operations);

    migrations.push({
      id,
      space: typeof row.space === "string" ? row.space : "app",
      name,
      displayName: toDisplayName(name),
      hash: typeof row.migration_hash === "string" ? row.migration_hash : "",
      fromHash:
        typeof row.origin_core_hash === "string" &&
        row.origin_core_hash.length > 0
          ? row.origin_core_hash
          : null,
      toHash:
        typeof row.destination_core_hash === "string"
          ? row.destination_core_hash
          : "",
      appliedAt: parseAppliedAt(row.created_at),
      operations,
      contractBefore: parseJsonish(row.contract_json_before),
      contractAfter: parseJsonish(row.contract_json_after),
      isDestructive: operations.some(
        (operation) => operation.operationClass === "destructive",
      ),
    });
  }

  migrations.sort((left, right) => left.id - right.id);

  // Fill missing before-snapshots from the predecessor's after-snapshot
  // within the same contract space — the chain invariant (each edge's
  // origin is its predecessor's destination) makes this exact.
  const lastAfterBySpace = new Map<string, unknown>();

  for (const migration of migrations) {
    if (migration.contractBefore == null && migration.fromHash !== null) {
      migration.contractBefore = lastAfterBySpace.get(migration.space) ?? null;
    }

    if (migration.contractAfter != null) {
      lastAfterBySpace.set(migration.space, migration.contractAfter);
    }
  }

  return migrations;
}

/**
 * Detects whether the connected database carries a Prisma Next
 * migration ledger (`prisma_contract.ledger`). Purely derived from
 * introspection data — no extra query.
 */
export function useMigrationsDetection(): {
  hasPrismaNextMigrations: boolean;
} {
  const { data: introspection } = useIntrospection();
  const ledgerTable =
    introspection.schemas["prisma_contract"]?.tables["ledger"];

  return { hasPrismaNextMigrations: ledgerTable != null };
}

/**
 * Loads the Prisma Next migration history from
 * `prisma_contract.ledger`, newest first.
 */
export function useMigrations() {
  const { adapter } = useStudio();
  const { hasPrismaNextMigrations } = useMigrationsDetection();

  const query = useQuery({
    enabled: hasPrismaNextMigrations,
    queryKey: ["prisma-next-migrations"] as const,
    queryFn: async ({ signal }) => {
      const [error, result] = await adapter.raw(
        { sql: LEDGER_QUERY },
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
