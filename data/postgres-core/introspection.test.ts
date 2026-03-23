import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import type { Executor } from "../executor";
import { createPGLiteExecutor } from "../pglite";
import { asQuery, Query } from "../query";
import { getTablesQuery, getTimezoneQuery } from "./introspection";

describe("postgres-core/introspection", () => {
  let executor: Executor;
  let pglite: PGlite;

  beforeAll(async () => {
    pglite = new PGlite();
    executor = createPGLiteExecutor(pglite);

    await pglite.exec(`
        create schema "zoo";
        create table "zoo"."animals" (
          "id" serial primary key,
          "name" varchar(255),
          "id_name" text GENERATED ALWAYS AS ((id::text || '-' || name)) STORED,
          "created_at" timestamp default CURRENT_TIMESTAMP,
          "created_time" time default CURRENT_TIME,
          "created_by" text default CURRENT_USER
        );
        create type "public"."role" as enum ('admin', 'maintainer', 'member');
        create table "public"."users" (
          "id" integer GENERATED ALWAYS AS IDENTITY primary key,
          "created_at" timestamp default now(),
          "created_date" date default CURRENT_DATE,
          "role" role not null,
          "animal_id" integer,
          "seniority_days" integer default 0,
          constraint "fk_animal" foreign key ("animal_id") references "zoo"."animals"("id")
        );
    `);
  });

  afterAll(async () => {
    await pglite.close();
  });

  describe("getTablesQuery", () => {
    it("should return a query object", () => {
      const query = getTablesQuery();

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [
            "",
            "nextval(%",
            "",
            true,
            "p",
            "f",
            0,
            true,
            "^pg_",
            "information_schema",
            "r",
            "v",
          ],
          "sql": "select "ns"."nspname" as "schema", "cls"."relname" as "name", (select coalesce(json_agg(agg), '[]') from (select "att"."attname" as "name", "fk_att"."attname" as "fk_column", "fk_cls"."relname" as "fk_table", "fk_ns"."nspname" as "fk_schema", "tns"."nspname" as "datatype_schema", "typ"."typname" as "datatype", ("att"."attidentity" != $1 or ("def"."adbin" is not null and pg_get_expr("def"."adbin", "def"."adrelid") like $2)) as "autoinc", "att"."attgenerated" != $3 as "computed", pg_get_expr("def"."adbin", "def"."adrelid") as "default", "att"."attnotnull" != $4 as "nullable", coalesce((select json_agg("enm"."enumlabel") as "o" from "pg_catalog"."pg_enum" as "enm" where "enm"."enumtypid" = "typ"."oid"), '[]') as "options", array_position("pk_con"."conkey", "att"."attnum") as "pk" from "pg_catalog"."pg_attribute" as "att" inner join "pg_catalog"."pg_type" as "typ" on "typ"."oid" = "att"."atttypid" inner join "pg_catalog"."pg_namespace" as "tns" on "tns"."oid" = "typ"."typnamespace" left join "pg_catalog"."pg_constraint" as "pk_con" on "pk_con"."contype" = $5 and "pk_con"."conrelid" = "cls"."oid" and "att"."attnum" = any("pk_con"."conkey") left join "pg_catalog"."pg_constraint" as "fk_con" on "fk_con"."contype" = $6 and "fk_con"."conrelid" = "cls"."oid" and "att"."attnum" = any("fk_con"."conkey") left join "pg_catalog"."pg_class" as "fk_cls" on "fk_cls"."oid" = "fk_con"."confrelid" left join "pg_catalog"."pg_namespace" as "fk_ns" on "fk_ns"."oid" = "fk_cls"."relnamespace" left join "pg_catalog"."pg_attribute" as "fk_att" on "fk_att"."attrelid" = "fk_cls"."oid" and "fk_att"."attnum" = any("fk_con"."confkey") left join "pg_catalog"."pg_attrdef" as "def" on "def"."adrelid" = "att"."attrelid" and "def"."adnum" = "att"."attnum" where "att"."attrelid" = "cls"."oid" and "att"."attnum" >= $7 and "att"."attisdropped" != $8) as agg) as "columns" from "pg_catalog"."pg_class" as "cls" inner join "pg_catalog"."pg_namespace" as "ns" on "cls"."relnamespace" = "ns"."oid" where "ns"."nspname" !~ $9 and "ns"."nspname" != $10 and "cls"."relkind" in ($11, $12)",
          "transformations": undefined,
        }
      `);
    });

    it("should return a query object with inlined parameters, when noParameters: true", () => {
      const query = getTablesQuery({ noParameters: true });

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [],
          "sql": "select "ns"."nspname" as "schema", "cls"."relname" as "name", (select coalesce(json_agg(agg), '[]') from (select "att"."attname" as "name", "fk_att"."attname" as "fk_column", "fk_cls"."relname" as "fk_table", "fk_ns"."nspname" as "fk_schema", "tns"."nspname" as "datatype_schema", "typ"."typname" as "datatype", ("att"."attidentity" != '' or ("def"."adbin" is not null and pg_get_expr("def"."adbin", "def"."adrelid") like 'nextval(%')) as "autoinc", "att"."attgenerated" != '' as "computed", pg_get_expr("def"."adbin", "def"."adrelid") as "default", "att"."attnotnull" != true as "nullable", coalesce((select json_agg("enm"."enumlabel") as "o" from "pg_catalog"."pg_enum" as "enm" where "enm"."enumtypid" = "typ"."oid"), '[]') as "options", array_position("pk_con"."conkey", "att"."attnum") as "pk" from "pg_catalog"."pg_attribute" as "att" inner join "pg_catalog"."pg_type" as "typ" on "typ"."oid" = "att"."atttypid" inner join "pg_catalog"."pg_namespace" as "tns" on "tns"."oid" = "typ"."typnamespace" left join "pg_catalog"."pg_constraint" as "pk_con" on "pk_con"."contype" = 'p' and "pk_con"."conrelid" = "cls"."oid" and "att"."attnum" = any("pk_con"."conkey") left join "pg_catalog"."pg_constraint" as "fk_con" on "fk_con"."contype" = 'f' and "fk_con"."conrelid" = "cls"."oid" and "att"."attnum" = any("fk_con"."conkey") left join "pg_catalog"."pg_class" as "fk_cls" on "fk_cls"."oid" = "fk_con"."confrelid" left join "pg_catalog"."pg_namespace" as "fk_ns" on "fk_ns"."oid" = "fk_cls"."relnamespace" left join "pg_catalog"."pg_attribute" as "fk_att" on "fk_att"."attrelid" = "fk_cls"."oid" and "fk_att"."attnum" = any("fk_con"."confkey") left join "pg_catalog"."pg_attrdef" as "def" on "def"."adrelid" = "att"."attrelid" and "def"."adnum" = "att"."attnum" where "att"."attrelid" = "cls"."oid" and "att"."attnum" >= 0 and "att"."attisdropped" != true) as agg) as "columns" from "pg_catalog"."pg_class" as "cls" inner join "pg_catalog"."pg_namespace" as "ns" on "cls"."relnamespace" = "ns"."oid" where "ns"."nspname" !~ '^pg_' and "ns"."nspname" != 'information_schema' and "cls"."relkind" in ('r', 'v')",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information about the query result", () => {
      const query = getTablesQuery();

      expectTypeOf(query).toEqualTypeOf<
        Query<{
          schema: string;
          name: string;
          columns: {
            autoinc: boolean;
            computed: boolean;
            datatype: string;
            datatype_schema: string;
            default: string | null;
            fk_column: string | null;
            fk_schema: string | null;
            fk_table: string | null;
            name: string;
            nullable: boolean;
            options: string[];
            pk: number | null;
          }[];
        }>
      >();
    });

    it("should return a query object that can be executed against a PostgreSQL-compatible database", async () => {
      const query = getTablesQuery();

      const [error, results] = await executor.execute(query);

      expect(error).toBeNull();
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "columns": [
              {
                "autoinc": true,
                "computed": false,
                "datatype": "int4",
                "datatype_schema": "pg_catalog",
                "default": null,
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "id",
                "nullable": false,
                "options": [],
                "pk": 1,
              },
              {
                "autoinc": false,
                "computed": false,
                "datatype": "int4",
                "datatype_schema": "pg_catalog",
                "default": null,
                "fk_column": "id",
                "fk_schema": "zoo",
                "fk_table": "animals",
                "name": "animal_id",
                "nullable": true,
                "options": [],
                "pk": null,
              },
              {
                "autoinc": false,
                "computed": false,
                "datatype": "int4",
                "datatype_schema": "pg_catalog",
                "default": "0",
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "seniority_days",
                "nullable": true,
                "options": [],
                "pk": null,
              },
              {
                "autoinc": false,
                "computed": false,
                "datatype": "date",
                "datatype_schema": "pg_catalog",
                "default": "CURRENT_DATE",
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "created_date",
                "nullable": true,
                "options": [],
                "pk": null,
              },
              {
                "autoinc": false,
                "computed": false,
                "datatype": "timestamp",
                "datatype_schema": "pg_catalog",
                "default": "now()",
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "created_at",
                "nullable": true,
                "options": [],
                "pk": null,
              },
              {
                "autoinc": false,
                "computed": false,
                "datatype": "role",
                "datatype_schema": "public",
                "default": null,
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "role",
                "nullable": false,
                "options": [
                  "admin",
                  "maintainer",
                  "member",
                ],
                "pk": null,
              },
            ],
            "name": "users",
            "schema": "public",
          },
          {
            "columns": [
              {
                "autoinc": true,
                "computed": false,
                "datatype": "int4",
                "datatype_schema": "pg_catalog",
                "default": "nextval('zoo.animals_id_seq'::regclass)",
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "id",
                "nullable": false,
                "options": [],
                "pk": 1,
              },
              {
                "autoinc": false,
                "computed": true,
                "datatype": "text",
                "datatype_schema": "pg_catalog",
                "default": "(((id)::text || '-'::text) || (name)::text)",
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "id_name",
                "nullable": true,
                "options": [],
                "pk": null,
              },
              {
                "autoinc": false,
                "computed": false,
                "datatype": "text",
                "datatype_schema": "pg_catalog",
                "default": "CURRENT_USER",
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "created_by",
                "nullable": true,
                "options": [],
                "pk": null,
              },
              {
                "autoinc": false,
                "computed": false,
                "datatype": "varchar",
                "datatype_schema": "pg_catalog",
                "default": null,
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "name",
                "nullable": true,
                "options": [],
                "pk": null,
              },
              {
                "autoinc": false,
                "computed": false,
                "datatype": "time",
                "datatype_schema": "pg_catalog",
                "default": "CURRENT_TIME",
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "created_time",
                "nullable": true,
                "options": [],
                "pk": null,
              },
              {
                "autoinc": false,
                "computed": false,
                "datatype": "timestamp",
                "datatype_schema": "pg_catalog",
                "default": "CURRENT_TIMESTAMP",
                "fk_column": null,
                "fk_schema": null,
                "fk_table": null,
                "name": "created_at",
                "nullable": true,
                "options": [],
                "pk": null,
              },
            ],
            "name": "animals",
            "schema": "zoo",
          },
        ]
      `);
    });
  });

  describe("getTimezoneQuery", () => {
    it("should return a query object", () => {
      const query = getTimezoneQuery();

      expect(query).toMatchInlineSnapshot(`
        {
          "parameters": [],
          "sql": "select current_setting('timezone') as "timezone"",
          "transformations": undefined,
        }
      `);
    });

    // eslint-disable-next-line vitest/expect-expect
    it("should return a query object that holds type information about the query result", () => {
      const query = getTimezoneQuery();

      expectTypeOf(query).toEqualTypeOf<Query<{ timezone: string }>>();
    });

    it.each(["UTC", "America/New_York"])(
      "should return a query object that can be executed against a PostgreSQL-compatible database (%s)",
      async (timezone) => {
        if (timezone) {
          await executor.execute(
            asQuery<never>(`set timezone = '${timezone}'`),
          );
        }

        const query = getTimezoneQuery();

        const [error, results] = await executor.execute(query);

        expect(error).toBeNull();
        expect(results).toStrictEqual([{ timezone }]);
      },
    );
  });
});
