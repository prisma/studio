import postgres from "postgres";

type OrganizationSeedRow = {
  created_at: Date;
  id: string;
  name: string;
  regions: string[];
  settings: Record<string, unknown>;
  tier: "enterprise" | "free" | "pro";
};

type TeamMemberSeedRow = {
  id: string;
  is_oncall: boolean;
  joined_at: Date;
  name: string;
  organization_id: string;
  profile: Record<string, unknown>;
  skills: string[];
  title: string;
};

export async function seedDatabase(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  const organizations = buildSeedOrganizations();
  const teamMembers = buildSeedTeamMembers(organizations);

  try {
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;

      await transaction.unsafe(`
        do $$
        begin
          if not exists (
            select 1
            from pg_type t
            inner join pg_namespace n on n.oid = t.typnamespace
            where t.typname = 'demo_search_status'
              and n.nspname = 'public'
          ) then
            create type public.demo_search_status as enum (
              'draft',
              'active',
              'archived'
            );
          end if;
        end
        $$;
      `);

      await transaction.unsafe(`
        create table if not exists organizations (
          id text primary key,
          name text not null,
          tier text not null check (tier in ('free', 'pro', 'enterprise')),
          regions text[] not null default array[]::text[],
          settings jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        )
      `);

      await transaction.unsafe(`
        create table if not exists team_members (
          id text primary key,
          organization_id text not null references organizations(id) on delete cascade,
          name text not null,
          title text not null,
          skills text[] not null default array[]::text[],
          profile jsonb not null default '{}'::jsonb,
          is_oncall boolean not null default false,
          joined_at timestamptz not null default now()
        )
      `);

      await transaction.unsafe(`
        create table if not exists incidents (
          id text primary key,
          organization_id text not null references organizations(id) on delete cascade,
          owner_id text references team_members(id) on delete set null,
          title text not null,
          severity integer not null check (severity between 1 and 5),
          status text not null check (status in ('open', 'investigating', 'resolved')),
          tags text[] not null default array[]::text[],
          timeline jsonb not null default '[]'::jsonb,
          created_at timestamptz not null default now(),
          resolved_at timestamptz
        )
      `);

      await transaction.unsafe(`
        create table if not exists feature_flags (
          key text primary key,
          organization_id text not null references organizations(id) on delete cascade,
          description text not null,
          enabled boolean not null,
          rollout integer not null check (rollout between 0 and 100),
          rules jsonb not null default '[]'::jsonb,
          updated_at timestamptz not null default now()
        )
      `);

      await transaction.unsafe(`
        create table if not exists all_data_types (
          id integer primary key,
          label text not null,
          short_code character(4) not null,
          display_name varchar(64) not null,
          status demo_search_status not null,
          bool_col boolean not null,
          smallint_col smallint not null,
          int_col integer not null,
          bigint_col bigint not null,
          numeric_col numeric(12, 3) not null,
          real_col real not null,
          double_col double precision not null,
          money_col money not null,
          uuid_col uuid not null,
          date_col date not null,
          time_col time not null,
          timetz_col time with time zone not null,
          timestamp_col timestamp not null,
          timestamptz_col timestamptz not null,
          interval_col interval not null,
          json_col json not null,
          jsonb_col jsonb not null,
          xml_col xml not null,
          bytea_col bytea not null,
          text_array_col text[] not null,
          int_array_col integer[] not null,
          uuid_array_col uuid[] not null,
          jsonb_array_col jsonb[] not null,
          inet_col inet not null,
          cidr_col cidr not null,
          macaddr_col macaddr not null,
          macaddr8_col macaddr8 not null,
          bit_col bit(8) not null,
          varbit_col varbit not null,
          point_col point not null,
          line_col line not null,
          lseg_col lseg not null,
          box_col box not null,
          path_col path not null,
          polygon_col polygon not null,
          circle_col circle not null,
          tsvector_col tsvector not null,
          tsquery_col tsquery not null,
          pg_lsn_col pg_lsn not null,
          jsonpath_col jsonpath not null,
          oid_col oid not null,
          regclass_col regclass not null,
          regtype_col regtype not null,
          int4range_col int4range not null,
          int8range_col int8range not null,
          numrange_col numrange not null,
          tsrange_col tsrange not null,
          tstzrange_col tstzrange not null,
          daterange_col daterange not null,
          int4multirange_col int4multirange not null,
          int8multirange_col int8multirange not null,
          nummultirange_col nummultirange not null,
          tsmultirange_col tsmultirange not null,
          tstzmultirange_col tstzmultirange not null,
          datemultirange_col datemultirange not null,
          pg_snapshot_col pg_snapshot not null
        )
      `);

      await transaction.unsafe(`
        truncate table
          all_data_types,
          incidents,
          feature_flags,
          team_members,
          organizations
        restart identity cascade
      `);

      await tx`
        insert into organizations ${tx(organizations, [
          "id",
          "name",
          "tier",
          "regions",
          "settings",
          "created_at",
        ])}
      `;

      await tx`
        insert into team_members ${tx(teamMembers, [
          "id",
          "organization_id",
          "name",
          "title",
          "skills",
          "profile",
          "is_oncall",
          "joined_at",
        ])}
      `;

      await transaction.unsafe(`
        insert into incidents (
          id,
          organization_id,
          owner_id,
          title,
          severity,
          status,
          tags,
          timeline,
          created_at,
          resolved_at
        ) values
          (
            'inc_1024',
            'org_acme',
            'usr_ava',
            'Checkout write latency spike',
            2,
            'investigating',
            array['database', 'checkout'],
            '[{"at": "2026-02-15T09:03:00Z", "event": "Alert fired"}, {"at": "2026-02-15T09:07:00Z", "event": "Mitigation started"}]'::jsonb,
            now() - interval '18 hours',
            null
          ),
          (
            'inc_2048',
            'org_northwind',
            'usr_maya',
            'Replica lag during nightly export',
            3,
            'resolved',
            array['replication', 'etl'],
            '[{"at": "2026-02-14T01:10:00Z", "event": "Lag detected"}, {"at": "2026-02-14T01:37:00Z", "event": "Backfill completed"}]'::jsonb,
            now() - interval '2 days',
            now() - interval '44 hours'
          )
      `);

      await transaction.unsafe(`
        insert into feature_flags (
          key,
          organization_id,
          description,
          enabled,
          rollout,
          rules,
          updated_at
        ) values
          (
            'checkout_partial_refunds',
            'org_acme',
            'Allow partial refunds in checkout dashboard',
            true,
            25,
            '[{"segment": "beta-customers", "region": "eu-central-1"}]'::jsonb,
            now() - interval '4 hours'
          ),
          (
            'warehouse_realtime_sync',
            'org_northwind',
            'Enable realtime warehouse stock sync',
            false,
            0,
            '[{"segment": "internal", "region": "us-west-2"}]'::jsonb,
            now() - interval '8 hours'
          )
      `);

      await transaction.unsafe(`
        insert into all_data_types (
          id,
          label,
          short_code,
          display_name,
          status,
          bool_col,
          smallint_col,
          int_col,
          bigint_col,
          numeric_col,
          real_col,
          double_col,
          money_col,
          uuid_col,
          date_col,
          time_col,
          timetz_col,
          timestamp_col,
          timestamptz_col,
          interval_col,
          json_col,
          jsonb_col,
          xml_col,
          bytea_col,
          text_array_col,
          int_array_col,
          uuid_array_col,
          jsonb_array_col,
          inet_col,
          cidr_col,
          macaddr_col,
          macaddr8_col,
          bit_col,
          varbit_col,
          point_col,
          line_col,
          lseg_col,
          box_col,
          path_col,
          polygon_col,
          circle_col,
          tsvector_col,
          tsquery_col,
          pg_lsn_col,
          jsonpath_col,
          oid_col,
          regclass_col,
          regtype_col,
          int4range_col,
          int8range_col,
          numrange_col,
          tsrange_col,
          tstzrange_col,
          daterange_col,
          int4multirange_col,
          int8multirange_col,
          nummultirange_col,
          tsmultirange_col,
          tstzmultirange_col,
          datemultirange_col,
          pg_snapshot_col
        )
        select
          i,
          format('search_row_%s', i),
          substr(md5(i::text), 1, 4),
          format('Search Demo Row %s', i),
          case
            when i % 3 = 0 then 'draft'
            when i % 3 = 1 then 'active'
            else 'archived'
          end::demo_search_status,
          i % 2 = 0,
          (i % 32767)::smallint,
          i * 10,
          i::bigint * 100000,
          (i::numeric * 1.234)::numeric(12, 3),
          i::real * 0.5,
          i::double precision * 0.75,
          (i::numeric * 10.5)::money,
          (
            lpad(to_hex(i), 8, '0') ||
            '-0000-4000-8000-' ||
            lpad(to_hex(i), 12, '0')
          )::uuid,
          date '2025-01-01' + ((i - 1) % 365),
          make_time(i % 24, (i * 3) % 60, ((i * 7) % 60)::double precision),
          (
            make_time(i % 24, (i * 5) % 60, ((i * 11) % 60)::double precision)::text ||
            '+00'
          )::timetz,
          timestamp '2025-01-01 00:00:00' + (i || ' hours')::interval,
          timestamptz '2025-01-01 00:00:00+00' + (i || ' hours')::interval,
          make_interval(days => i % 30, hours => i % 24, mins => i % 60),
          json_build_object(
            'row',
            i,
            'name',
            format('row-%s', i),
            'active',
            i % 2 = 0
          ),
          jsonb_build_object(
            'row',
            i,
            'name',
            format('row-%s', i),
            'tags',
            jsonb_build_array('alpha', i::text)
          ),
          xmlparse(content format('<row id="%s"><name>row-%s</name></row>', i, i)),
          decode(lpad(to_hex(i), 8, '0'), 'hex'),
          array[
            format('tag-%s', i),
            format('group-%s', i % 10)
          ],
          array[i, i + 1, i + 2],
          array[
            (
              lpad(to_hex(i), 8, '0') ||
              '-0000-4000-8000-' ||
              lpad(to_hex(i), 12, '0')
            )::uuid,
            (
              lpad(to_hex(i + 1000), 8, '0') ||
              '-0000-4000-8000-' ||
              lpad(to_hex(i + 1000), 12, '0')
            )::uuid
          ],
          array[
            jsonb_build_object('item', i),
            jsonb_build_object('item', i + 1)
          ]::jsonb[],
          format('10.0.0.%s', (i % 254) + 1)::inet,
          format('10.0.%s.0/24', i % 254)::cidr,
          (
            '08:00:2b:' ||
            lpad(to_hex((i / 256) % 256), 2, '0') ||
            ':' ||
            lpad(to_hex((i / 16) % 256), 2, '0') ||
            ':' ||
            lpad(to_hex(i % 256), 2, '0')
          )::macaddr,
          (
            '08:00:2b:ff:fe:' ||
            lpad(to_hex((i / 256) % 256), 2, '0') ||
            ':' ||
            lpad(to_hex((i / 16) % 256), 2, '0') ||
            ':' ||
            lpad(to_hex(i % 256), 2, '0')
          )::macaddr8,
          i::bit(8),
          (i::bit(16))::varbit,
          point(i::double precision, (i + 0.5)::double precision),
          line(
            point(i::double precision, (i + 1)::double precision),
            point((i + 2)::double precision, (i + 3)::double precision)
          ),
          lseg(
            point(i::double precision, i::double precision),
            point((i + 1)::double precision, (i + 1)::double precision)
          ),
          box(
            point(i::double precision, i::double precision),
            point((i + 1)::double precision, (i + 1)::double precision)
          ),
          format(
            '[(%s,%s),(%s,%s),(%s,%s)]',
            i,
            i,
            i + 1,
            i,
            i + 1,
            i + 1
          )::path,
          format(
            '((%s,%s),(%s,%s),(%s,%s),(%s,%s))',
            i,
            i,
            i + 1,
            i,
            i + 1,
            i + 1,
            i,
            i + 1
          )::polygon,
          circle(
            point(i::double precision, i::double precision),
            ((i % 10) + 1)::double precision
          ),
          to_tsvector('simple', format('row %s alpha beta', i)),
          plainto_tsquery('simple', format('row %s', i)),
          format(
            '%s/%s',
            upper(to_hex(i)),
            upper(lpad(to_hex(i * 16), 8, '0'))
          )::pg_lsn,
          format('$.rows[%s]', i % 10)::jsonpath,
          'pg_class'::regclass::oid,
          'pg_class'::regclass,
          'text'::regtype,
          int4range(i, i + 10, '[)'),
          int8range(i::bigint * 10, i::bigint * 10 + 100, '[)'),
          numrange(i::numeric / 10, i::numeric / 10 + 1.5, '[)'),
          tsrange(
            timestamp '2025-01-01 00:00:00' + (i || ' hours')::interval,
            timestamp '2025-01-01 00:00:00' + ((i + 1) || ' hours')::interval,
            '[)'
          ),
          tstzrange(
            timestamptz '2025-01-01 00:00:00+00' + (i || ' hours')::interval,
            timestamptz '2025-01-01 00:00:00+00' + ((i + 1) || ' hours')::interval,
            '[)'
          ),
          daterange(
            date '2025-01-01' + ((i - 1) % 365),
            date '2025-01-01' + ((i - 1) % 365) + 7,
            '[)'
          ),
          int4multirange(
            int4range(i, i + 10, '[)'),
            int4range(i + 20, i + 30, '[)')
          ),
          int8multirange(
            int8range(i::bigint * 10, i::bigint * 10 + 100, '[)'),
            int8range(i::bigint * 10 + 200, i::bigint * 10 + 300, '[)')
          ),
          nummultirange(
            numrange(i::numeric / 10, i::numeric / 10 + 1.5, '[)'),
            numrange(i::numeric / 10 + 2.0, i::numeric / 10 + 3.0, '[)')
          ),
          tsmultirange(
            tsrange(
              timestamp '2025-01-01 00:00:00' + (i || ' hours')::interval,
              timestamp '2025-01-01 00:00:00' + ((i + 1) || ' hours')::interval,
              '[)'
            ),
            tsrange(
              timestamp '2025-01-01 00:00:00' + ((i + 2) || ' hours')::interval,
              timestamp '2025-01-01 00:00:00' + ((i + 3) || ' hours')::interval,
              '[)'
            )
          ),
          tstzmultirange(
            tstzrange(
              timestamptz '2025-01-01 00:00:00+00' + (i || ' hours')::interval,
              timestamptz '2025-01-01 00:00:00+00' + ((i + 1) || ' hours')::interval,
              '[)'
            ),
            tstzrange(
              timestamptz '2025-01-01 00:00:00+00' + ((i + 2) || ' hours')::interval,
              timestamptz '2025-01-01 00:00:00+00' + ((i + 3) || ' hours')::interval,
              '[)'
            )
          ),
          datemultirange(
            daterange(
              date '2025-01-01' + ((i - 1) % 365),
              date '2025-01-01' + ((i - 1) % 365) + 7,
              '[)'
            ),
            daterange(
              date '2025-01-01' + ((i - 1) % 365) + 14,
              date '2025-01-01' + ((i - 1) % 365) + 21,
              '[)'
            )
          ),
          pg_current_snapshot()
        from generate_series(1, 100) as series(i)
      `);
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function buildSeedOrganizations(): OrganizationSeedRow[] {
  const organizations: OrganizationSeedRow[] = [
    {
      created_at: daysAgo(120),
      id: "org_acme",
      name: "Acme Labs",
      regions: ["us-east-1", "eu-central-1"],
      settings: { owner: "finance@acme.io", seats: 42, sso: true },
      tier: "enterprise",
    },
    {
      created_at: daysAgo(45),
      id: "org_northwind",
      name: "Northwind Retail",
      regions: ["us-west-2"],
      settings: { owner: "ops@northwind.io", seats: 14, sso: false },
      tier: "pro",
    },
  ];

  const additionalOrganizations = [
    {
      createdAtDaysAgo: 12,
      id: "org_skyline",
      name: "Skyline Freight",
      regions: ["us-east-1", "us-west-2"],
      seats: 36,
      tier: "pro",
    },
    {
      createdAtDaysAgo: 27,
      id: "org_lighthouse",
      name: "Lighthouse Health",
      regions: ["eu-west-1"],
      seats: 58,
      tier: "enterprise",
    },
    {
      createdAtDaysAgo: 63,
      id: "org_orbit",
      name: "Orbit Travel",
      regions: ["ap-southeast-1", "us-west-2"],
      seats: 22,
      tier: "pro",
    },
    {
      createdAtDaysAgo: 88,
      id: "org_maple",
      name: "Maple Commerce",
      regions: ["ca-central-1", "us-east-1"],
      seats: 17,
      tier: "free",
    },
    {
      createdAtDaysAgo: 101,
      id: "org_harbor",
      name: "Harbor Logistics",
      regions: ["eu-central-1", "eu-west-1"],
      seats: 64,
      tier: "enterprise",
    },
    {
      createdAtDaysAgo: 133,
      id: "org_atlas",
      name: "Atlas Robotics",
      regions: ["us-east-1", "ap-northeast-1"],
      seats: 48,
      tier: "enterprise",
    },
    {
      createdAtDaysAgo: 18,
      id: "org_pine",
      name: "Pine Education",
      regions: ["us-east-2"],
      seats: 11,
      tier: "free",
    },
    {
      createdAtDaysAgo: 52,
      id: "org_summit",
      name: "Summit Media",
      regions: ["eu-west-1", "us-east-1"],
      seats: 29,
      tier: "pro",
    },
    {
      createdAtDaysAgo: 74,
      id: "org_cinder",
      name: "Cinder Energy",
      regions: ["us-central-1"],
      seats: 33,
      tier: "pro",
    },
    {
      createdAtDaysAgo: 149,
      id: "org_willow",
      name: "Willow Bio",
      regions: ["eu-north-1", "eu-central-1"],
      seats: 71,
      tier: "enterprise",
    },
  ] as const;

  organizations.push(
    ...additionalOrganizations.map((organization, index) => ({
      created_at: daysAgo(organization.createdAtDaysAgo),
      id: organization.id,
      name: organization.name,
      regions: [...organization.regions],
      settings: {
        owner: `ops+${organization.id}@demo.prisma.io`,
        seats: organization.seats,
        sla: index % 2 === 0 ? "gold" : "silver",
        sso: organization.tier !== "free",
      },
      tier: organization.tier,
    })),
  );

  if (organizations.length !== 12) {
    throw new Error(
      `Demo seed must create exactly 12 organizations, received ${organizations.length}.`,
    );
  }

  return organizations;
}

function buildSeedTeamMembers(
  organizations: OrganizationSeedRow[],
): TeamMemberSeedRow[] {
  const teamMembers: TeamMemberSeedRow[] = [
    {
      id: "usr_ava",
      is_oncall: true,
      joined_at: daysAgo(90),
      name: "Ava Patel",
      organization_id: "org_acme",
      profile: { slack: "@ava", timezone: "UTC+1" },
      skills: ["postgres", "kafka", "incident-response"],
      title: "Staff Engineer",
    },
    {
      id: "usr_liam",
      is_oncall: false,
      joined_at: daysAgo(80),
      name: "Liam Chen",
      organization_id: "org_acme",
      profile: { slack: "@liam", timezone: "UTC-8" },
      skills: ["dbt", "airflow", "sql"],
      title: "Data Engineer",
    },
    {
      id: "usr_maya",
      is_oncall: true,
      joined_at: daysAgo(35),
      name: "Maya Rodriguez",
      organization_id: "org_northwind",
      profile: { slack: "@maya", timezone: "UTC-5" },
      skills: ["terraform", "postgres", "redis"],
      title: "Platform Engineer",
    },
  ];

  const generatedOrganizations = organizations.filter(
    (organization) =>
      organization.id !== "org_acme" && organization.id !== "org_northwind",
  );
  const generatedMemberCounts = [40, 40, 40, 40, 40, 40, 40, 39, 39, 39];
  const titleCycle = [
    "Software Engineer",
    "Product Manager",
    "Data Analyst",
    "Support Engineer",
    "Site Reliability Engineer",
    "Customer Success Manager",
  ] as const;
  const skillCycle = [
    ["sql", "postgres", "analytics"],
    ["react", "typescript", "design-systems"],
    ["terraform", "aws", "incident-response"],
    ["python", "dbt", "warehouse"],
    ["support", "playbooks", "api-debugging"],
    ["salesforce", "dashboards", "automation"],
  ] as const;
  const timezoneCycle = [
    "UTC-8",
    "UTC-5",
    "UTC",
    "UTC+1",
    "UTC+5:30",
    "UTC+8",
  ] as const;
  const firstNames = [
    "Aiden",
    "Bella",
    "Caleb",
    "Daria",
    "Ethan",
    "Freya",
    "Gavin",
    "Hazel",
    "Isaac",
    "Juno",
    "Kai",
    "Lena",
    "Milo",
    "Nina",
    "Owen",
    "Priya",
    "Quinn",
    "Rhea",
    "Soren",
    "Talia",
    "Uma",
    "Vera",
    "Wes",
    "Xena",
    "Yara",
    "Zane",
  ] as const;
  const lastNames = [
    "Anders",
    "Brooks",
    "Cole",
    "Diaz",
    "Edwards",
    "Foster",
    "Gupta",
    "Hayes",
    "Ibrahim",
    "Jensen",
    "Kim",
    "Lopez",
    "Morris",
    "Nakamura",
    "Owens",
    "Park",
    "Quintero",
    "Reed",
    "Singh",
    "Turner",
    "Usman",
    "Valdez",
    "White",
    "Xu",
    "Young",
    "Zimmer",
  ] as const;

  generatedOrganizations.forEach((organization, organizationIndex) => {
    const memberCount = generatedMemberCounts[organizationIndex];

    if (memberCount == null) {
      throw new Error(
        `Missing generated team member count for ${organization.id}.`,
      );
    }

    for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
      const serial = teamMembers.length + 1;
      const title = titleCycle[serial % titleCycle.length] ?? titleCycle[0];
      const skills = [
        ...(skillCycle[serial % skillCycle.length] ?? skillCycle[0]),
      ];
      const firstName = firstNames[serial % firstNames.length] ?? firstNames[0];
      const lastName =
        lastNames[(serial + organizationIndex) % lastNames.length] ??
        lastNames[0];
      const timezone =
        timezoneCycle[serial % timezoneCycle.length] ?? timezoneCycle[0];
      const idSuffix = serial.toString().padStart(3, "0");

      teamMembers.push({
        id: `usr_demo_${idSuffix}`,
        is_oncall: serial % 7 === 0,
        joined_at: daysAgo(20 + ((serial * 3) % 180)),
        name: `${firstName} ${lastName}`,
        organization_id: organization.id,
        profile: {
          slack: `@demo_${idSuffix}`,
          timezone,
        },
        skills,
        title,
      });
    }
  });

  if (teamMembers.length !== 400) {
    throw new Error(
      `Demo seed must create exactly 400 team members, received ${teamMembers.length}.`,
    );
  }

  return teamMembers;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
