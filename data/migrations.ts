import type { ExecuteOptions, Executor } from "./executor";
import type { Either } from "./type-utils";

export const PRISMA_TABLES_SCHEMA = "_prisma";
export const LEGACY_PRISMA_TABLES_SCHEMA = "prisma_contract";

/** Schemas that can hold Prisma's own tables, most recent name first. */
export const PRISMA_TABLES_SCHEMAS = [
  PRISMA_TABLES_SCHEMA,
  LEGACY_PRISMA_TABLES_SCHEMA,
] as const;

export type PrismaTablesSchema = (typeof PRISMA_TABLES_SCHEMAS)[number];

export function choosePrismaTablesSchema(
  hasLedger: (schema: PrismaTablesSchema) => boolean,
): PrismaTablesSchema | null {
  return PRISMA_TABLES_SCHEMAS.find(hasLedger) ?? null;
}

export function ledgerQuery(schema: PrismaTablesSchema): string {
  return `
  select
    l."id", l."space", l."migration_name", l."migration_hash",
    l."origin_core_hash", l."destination_core_hash",
    l."operations", l."created_at",
    cb."contract_json" as "contract_json_before",
    ca."contract_json" as "contract_json_after"
  from "${schema}"."ledger" l
  left join "${schema}"."contract" cb on cb."core_hash" = l."origin_core_hash"
  left join "${schema}"."contract" ca on ca."core_hash" = l."destination_core_hash"
  order by l."id" asc
`;
}

/**
 * Fallback for databases bootstrapped before the content-addressed
 * `contract` store existed — the ledger alone still renders the list;
 * diffs are empty without snapshots.
 */
export function ledgerQueryWithoutContract(schema: PrismaTablesSchema): string {
  return `
  select
    "id", "space", "migration_name", "migration_hash",
    "origin_core_hash", "destination_core_hash",
    "operations", "created_at"
  from "${schema}"."ledger"
  order by "id" asc
`;
}

/**
 * Cheap navigation-visibility probe: one EXISTS instead of fetching the
 * full ledger (whose contract snapshots can be megabytes of jsonb).
 */
export function ledgerProbeQuery(schema: PrismaTablesSchema): string {
  return `select exists (select 1 from "${schema}"."ledger") as "has_rows"`;
}

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
      contractBefore: parseJsonish(row.contract_json_before) ?? null,
      contractAfter: parseJsonish(row.contract_json_after) ?? null,
      isDestructive: operations.some(
        (operation) => operation.operationClass === "destructive",
      ),
    });
  }

  migrations.sort((left, right) => left.id - right.id);

  return migrations;
}

export interface RecordedSchema {
  status:
    | "available"
    | "no-ledger"
    | "no-contract-store"
    | "empty"
    | "missing-snapshot";
  contract: unknown;
  coreHash: string | null;
  appliedAt: Date | null;
}

const CONTRACT_TABLES_QUERY = `select
  to_regclass('${PRISMA_TABLES_SCHEMA}.ledger') is not null as has_prisma_ledger,
  to_regclass('${PRISMA_TABLES_SCHEMA}.contract') is not null as has_prisma_contract,
  to_regclass('${LEGACY_PRISMA_TABLES_SCHEMA}.ledger') is not null as has_legacy_ledger,
  to_regclass('${LEGACY_PRISMA_TABLES_SCHEMA}.contract') is not null as has_legacy_contract`;

const PROBED_TABLE_COLUMNS: Record<
  PrismaTablesSchema,
  { ledger: string; contract: string }
> = {
  [PRISMA_TABLES_SCHEMA]: {
    ledger: "has_prisma_ledger",
    contract: "has_prisma_contract",
  },
  [LEGACY_PRISMA_TABLES_SCHEMA]: {
    ledger: "has_legacy_ledger",
    contract: "has_legacy_contract",
  },
};

function currentAppContractQuery(schema: PrismaTablesSchema): string {
  return `select l."id", l."space", l."destination_core_hash",
  l."created_at", c."contract_json" as "contract_json_after"
  from "${schema}"."ledger" l
  left join "${schema}"."contract" c on c."core_hash" = l."destination_core_hash"
  where l."space" = 'app'
  order by l."id" desc limit 1`;
}

/** Reads the latest applied PostgreSQL app snapshot; never uses an older contract. */
export async function readRecordedSchema(
  executor: Executor,
  options?: ExecuteOptions,
): Promise<Either<Error, RecordedSchema>> {
  const [probeError, tables] = await executor.execute<Record<string, unknown>>(
    { sql: CONTRACT_TABLES_QUERY, parameters: [] },
    options,
  );
  if (probeError) return [probeError];
  const empty: RecordedSchema = {
    status: "no-ledger",
    contract: null,
    coreHash: null,
    appliedAt: null,
  };
  const probed = tables[0] ?? {};
  const schema = choosePrismaTablesSchema(
    (candidate) => probed[PROBED_TABLE_COLUMNS[candidate].ledger] === true,
  );
  if (schema === null) return [null, empty];
  if (probed[PROBED_TABLE_COLUMNS[schema].contract] !== true)
    return [null, { ...empty, status: "no-contract-store" }];
  const [ledgerError, rows] = await executor.execute<Record<string, unknown>>(
    { sql: currentAppContractQuery(schema), parameters: [] },
    options,
  );
  if (ledgerError) return [ledgerError];
  const latest = parseLedgerRows(rows)[0];
  if (!latest) return [null, { ...empty, status: "empty" }];
  return [
    null,
    {
      status: latest.contractAfter == null ? "missing-snapshot" : "available",
      contract: latest.contractAfter,
      coreHash: latest.toHash,
      appliedAt: latest.appliedAt,
    },
  ];
}

export interface SchemaComparison {
  status: "available" | "unavailable";
  title: string;
  fromLabel: string;
  toLabel: string;
  before: unknown;
  after: unknown;
  message?: string;
  mode: "schema" | "diff";
}
