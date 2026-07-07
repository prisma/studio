import type postgres from "postgres";

import fixtureJson from "./fixtures/prisma-contract-migrations.json";

/**
 * Replays the Prisma Next migration history captured from the
 * migrations-showcase example (see prisma-next repo,
 * examples/migrations-showcase) into the demo database:
 *
 * - restores `prisma_contract.marker` / `prisma_contract.ledger` plus the
 *   content-addressed `prisma_contract.contract` store (one row per
 *   distinct contract, keyed by its storage hash), and
 * - re-executes every migration operation's SQL in ledger order so the
 *   live schema matches the migration history exactly.
 *
 * Studio's Migrations view detects the ledger table and renders the
 * visual diff per migration by joining the store onto the ledger's
 * origin/destination hash columns — both edge endpoints are direct
 * lookups.
 */

interface FixtureMarkerRow {
  space: string;
  core_hash: string;
  profile_hash: string;
  contract_json: unknown;
  canonical_version: number | null;
  app_tag: string | null;
  meta: unknown;
  invariants: string[];
  updated_at: string;
}

interface FixtureOperationStep {
  sql: string;
  params?: unknown[];
}

interface FixtureOperation {
  id: string;
  label: string;
  operationClass: string;
  execute?: FixtureOperationStep[];
}

interface FixtureLedgerRow {
  id: number;
  space: string;
  migration_name: string;
  migration_hash: string;
  origin_core_hash: string | null;
  destination_core_hash: string;
  contract_json_before: unknown;
  contract_json_after: unknown;
  operations: FixtureOperation[];
  created_at: string;
}

interface MigrationsFixture {
  generatedAt: string;
  marker: FixtureMarkerRow[];
  ledger: FixtureLedgerRow[];
}

// Statically imported so every bundling path (tsx, `bun build` for the
// local bundle, and the Compute deploy build) inlines the fixture into
// the artifact instead of depending on a file next to the bundle.
function loadFixture(): MigrationsFixture {
  return fixtureJson as unknown as MigrationsFixture;
}

export async function seedPrismaNextMigrations(
  sql: postgres.Sql,
): Promise<void> {
  const fixture = loadFixture();

  await sql.unsafe(`create schema if not exists prisma_contract`);
  await sql.unsafe(`
    create table if not exists prisma_contract.marker (
      space text primary key default 'app',
      core_hash text not null,
      profile_hash text not null,
      contract_json jsonb,
      canonical_version int,
      updated_at timestamptz not null default now(),
      app_tag text,
      meta jsonb not null default '{}',
      invariants text[] not null default '{}'
    )
  `);
  await sql.unsafe(`
    create table if not exists prisma_contract.ledger (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      space text not null,
      migration_name text not null,
      migration_hash text not null,
      origin_core_hash text,
      origin_profile_hash text,
      destination_core_hash text not null,
      destination_profile_hash text,
      operations jsonb not null
    )
  `);
  await sql.unsafe(`
    create table if not exists prisma_contract.contract (
      core_hash text not null primary key,
      created_at timestamptz not null default now(),
      contract_json jsonb not null
    )
  `);

  await upgradeLegacyLedger(sql);

  const [{ count }] = (await sql.unsafe(
    `select count(*)::int as count from prisma_contract.ledger`,
  )) as unknown as [{ count: number }];

  if (count > 0) {
    return;
  }

  for (const row of fixture.ledger) {
    for (const operation of row.operations) {
      for (const step of operation.execute ?? []) {
        await sql.unsafe(step.sql, (step.params ?? []) as never[]);
      }
    }

    // The fixture predates the content-addressed store and carries both
    // bookends per row; only the after-state is written — keyed by the
    // destination hash, deduplicated on conflict — and every non-baseline
    // origin hash is some predecessor's destination, so both endpoints of
    // every edge resolve.
    if (row.contract_json_after !== null) {
      await sql`
        insert into prisma_contract.contract (core_hash, created_at, contract_json)
        values (
          ${row.destination_core_hash}, ${row.created_at},
          ${sql.json(row.contract_json_after as never)}
        )
        on conflict (core_hash) do nothing
      `;
    }

    await sql`
      insert into prisma_contract.ledger (
        created_at, space, migration_name, migration_hash,
        origin_core_hash, destination_core_hash, operations
      ) values (
        ${row.created_at}, ${row.space}, ${row.migration_name},
        ${row.migration_hash}, ${row.origin_core_hash},
        ${row.destination_core_hash},
        ${sql.json(row.operations as never)}
      )
    `;
  }

  for (const row of fixture.marker) {
    await sql`
      insert into prisma_contract.marker (
        space, core_hash, profile_hash, contract_json, canonical_version,
        updated_at, app_tag, meta, invariants
      ) values (
        ${row.space}, ${row.core_hash}, ${row.profile_hash},
        ${row.contract_json === null ? null : sql.json(row.contract_json as never)},
        ${row.canonical_version}, ${row.updated_at}, ${row.app_tag},
        ${sql.json((row.meta ?? {}) as never)}, ${row.invariants}
      )
      on conflict (space) do nothing
    `;
  }

  await seedShowcaseRows(sql);
}

/**
 * Upgrades a demo database seeded by an older shape so a persistent
 * volume converges on the hash-keyed contract store:
 *
 * - a contract table keyed by `ledger_id` (the interim 1:1 design) is
 *   re-keyed by each row's destination hash, and
 * - a ledger still carrying the legacy `contract_json_before/after`
 *   columns has its after-states moved into the store and the bookend
 *   columns dropped.
 */
async function upgradeLegacyLedger(sql: postgres.Sql): Promise<void> {
  const ledgerIdKeyed = (await sql.unsafe(`
    select 1
    from information_schema.columns
    where table_schema = 'prisma_contract'
      and table_name = 'contract'
      and column_name = 'ledger_id'
  `)) as unknown as unknown[];

  if (ledgerIdKeyed.length > 0) {
    await sql.unsafe(`
      create table prisma_contract.contract_rekeyed (
        core_hash text not null primary key,
        created_at timestamptz not null default now(),
        contract_json jsonb not null
      )
    `);
    await sql.unsafe(`
      insert into prisma_contract.contract_rekeyed (core_hash, created_at, contract_json)
      select l.destination_core_hash, c.created_at, c.contract_json
      from prisma_contract.contract c
      join prisma_contract.ledger l on l.id = c.ledger_id
      on conflict (core_hash) do nothing
    `);
    await sql.unsafe(`drop table prisma_contract.contract`);
    await sql.unsafe(
      `alter table prisma_contract.contract_rekeyed rename to contract`,
    );
  }

  const legacyColumns = (await sql.unsafe(`
    select 1
    from information_schema.columns
    where table_schema = 'prisma_contract'
      and table_name = 'ledger'
      and column_name = 'contract_json_after'
  `)) as unknown as unknown[];

  if (legacyColumns.length === 0) {
    return;
  }

  await sql.unsafe(`
    insert into prisma_contract.contract (core_hash, created_at, contract_json)
    select destination_core_hash, created_at, contract_json_after
    from prisma_contract.ledger
    where contract_json_after is not null
    on conflict (core_hash) do nothing
  `);
  await sql.unsafe(
    `alter table prisma_contract.ledger drop column if exists contract_json_before`,
  );
  await sql.unsafe(
    `alter table prisma_contract.ledger drop column if exists contract_json_after`,
  );
}

/**
 * A few rows for the tables created by the replayed migrations so the
 * demo tables aren't empty when browsed.
 */
async function seedShowcaseRows(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    with team as (
      insert into "team" (id, name, slug)
      values (gen_random_uuid(), 'Aurora Core', 'aurora-core')
      returning id
    ),
    users as (
      insert into "user" (id, email, name, "avatarUrl", bio, "teamId", "lastSeenAt")
      select gen_random_uuid(), email, name, null, bio, team.id, now()
      from team,
        (values
          ('ada@aurora.dev', 'Ada Lovelace', 'Loves invariants.'),
          ('grace@aurora.dev', 'Grace Hopper', 'Ship it.'),
          ('edsger@aurora.dev', 'Edsger Dijkstra', 'Simplicity advocate.')
        ) as seed(email, name, bio)
      returning id, email
    ),
    project as (
      insert into "project" (id, name, description, "ownerId", settings)
      select gen_random_uuid(), 'Launch Aurora', 'The Q3 flagship launch.', users.id, '{"visibility":"internal"}'::jsonb
      from users
      where users.email = 'ada@aurora.dev'
      returning id
    ),
    milestone as (
      insert into "milestone" (id, "projectId", title, "dueAt")
      select gen_random_uuid(), project.id, 'Public beta', now() + interval '21 days'
      from project
      returning id, "projectId"
    )
    insert into "task" (id, "projectId", title, priority, status, "dueAt", "milestoneId")
    select gen_random_uuid(), milestone."projectId", seed.title, seed.priority, seed.status,
      now() + (seed.due_days || ' days')::interval, milestone.id
    from milestone,
      (values
        ('Design the migration timeline', 'high', 'in_progress', '3'),
        ('Ship visual schema diffs', 'high', 'todo', '7'),
        ('Polish FigJam-style cards', 'medium', 'todo', '10'),
        ('Record the launch video', 'low', 'done', '1')
      ) as seed(title, priority, status, due_days)
  `);
}
