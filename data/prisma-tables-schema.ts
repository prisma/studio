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
