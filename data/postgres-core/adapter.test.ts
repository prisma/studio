import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Adapter } from "../adapter";
import { createPGLiteExecutor } from "../pglite";
import { createPostgresAdapter } from "./adapter";

describe("postgres-core/adapter", () => {
  let adapter: Adapter;
  let pglite: PGlite;

  beforeAll(async () => {
    pglite = new PGlite();
    const executor = createPGLiteExecutor(pglite);
    adapter = createPostgresAdapter({ executor });

    await pglite.exec(`
        create schema "zoo";
        create table "zoo"."animals" (
          "id" serial primary key,
          "name" varchar(255),
          "id_name" text GENERATED ALWAYS AS ((id::text || '-' || name)) STORED
        );
        create type "public"."role" as enum ('admin', 'maintainer', 'member');
        create table "public"."users" (
          "id" serial primary key,
          "created_at" timestamp,
          "role" role not null,
          "animal_id" integer,
          constraint "fk_animal" foreign key ("animal_id") references "zoo"."animals"("id")
        );
        create table "public"."posts" (
          "id" serial primary key,
          "title" varchar(255),  
          "content" text,
          "author_id" integer references "public"."users"("id"),
          "created_at" timestamp default now()
        );
    `);
  });

  afterAll(async () => {
    await pglite.close();
  });

  describe("introspect", () => {
    it("should introspect the database correctly", async () => {
      const result = await adapter.introspect({});

      expect(result).toMatchInlineSnapshot(`
        [
          null,
          {
            "filterOperators": [
              "=",
              "!=",
              ">",
              ">=",
              "<",
              "<=",
              "is",
              "is not",
              "like",
              "not like",
              "ilike",
              "not ilike",
            ],
            "query": {
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
            },
            "schemas": {
              "public": {
                "name": "public",
                "tables": {
                  "posts": {
                    "columns": {
                      "author_id": {
                        "datatype": {
                          "group": "numeric",
                          "isArray": false,
                          "isNative": true,
                          "name": "int4",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": null,
                        "fkColumn": "id",
                        "fkSchema": "public",
                        "fkTable": "users",
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "author_id",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "public",
                        "table": "posts",
                      },
                      "content": {
                        "datatype": {
                          "group": "string",
                          "isArray": false,
                          "isNative": true,
                          "name": "text",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "content",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "public",
                        "table": "posts",
                      },
                      "created_at": {
                        "datatype": {
                          "format": "YYYY-MM-DD HH:mm:ss.SSS",
                          "group": "datetime",
                          "isArray": false,
                          "isNative": true,
                          "name": "timestamp",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": "now()",
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "created_at",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "public",
                        "table": "posts",
                      },
                      "id": {
                        "datatype": {
                          "group": "numeric",
                          "isArray": false,
                          "isNative": true,
                          "name": "int4",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": "nextval('posts_id_seq'::regclass)",
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": true,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "id",
                        "nullable": false,
                        "pkPosition": 1,
                        "schema": "public",
                        "table": "posts",
                      },
                      "title": {
                        "datatype": {
                          "group": "string",
                          "isArray": false,
                          "isNative": true,
                          "name": "varchar",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "title",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "public",
                        "table": "posts",
                      },
                    },
                    "name": "posts",
                    "schema": "public",
                  },
                  "users": {
                    "columns": {
                      "animal_id": {
                        "datatype": {
                          "group": "numeric",
                          "isArray": false,
                          "isNative": true,
                          "name": "int4",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": null,
                        "fkColumn": "id",
                        "fkSchema": "zoo",
                        "fkTable": "animals",
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "animal_id",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "public",
                        "table": "users",
                      },
                      "created_at": {
                        "datatype": {
                          "format": "YYYY-MM-DD HH:mm:ss.SSS",
                          "group": "datetime",
                          "isArray": false,
                          "isNative": true,
                          "name": "timestamp",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "created_at",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "public",
                        "table": "users",
                      },
                      "id": {
                        "datatype": {
                          "group": "numeric",
                          "isArray": false,
                          "isNative": true,
                          "name": "int4",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": "nextval('users_id_seq'::regclass)",
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": true,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "id",
                        "nullable": false,
                        "pkPosition": 1,
                        "schema": "public",
                        "table": "users",
                      },
                      "role": {
                        "datatype": {
                          "group": "enum",
                          "isArray": false,
                          "isNative": false,
                          "name": "role",
                          "options": [
                            "admin",
                            "maintainer",
                            "member",
                          ],
                          "schema": "public",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": true,
                        "name": "role",
                        "nullable": false,
                        "pkPosition": null,
                        "schema": "public",
                        "table": "users",
                      },
                    },
                    "name": "users",
                    "schema": "public",
                  },
                },
              },
              "zoo": {
                "name": "zoo",
                "tables": {
                  "animals": {
                    "columns": {
                      "id": {
                        "datatype": {
                          "group": "numeric",
                          "isArray": false,
                          "isNative": true,
                          "name": "int4",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": "nextval('zoo.animals_id_seq'::regclass)",
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": true,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "id",
                        "nullable": false,
                        "pkPosition": 1,
                        "schema": "zoo",
                        "table": "animals",
                      },
                      "id_name": {
                        "datatype": {
                          "group": "string",
                          "isArray": false,
                          "isNative": true,
                          "name": "text",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": "(((id)::text || '-'::text) || (name)::text)",
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": true,
                        "isRequired": false,
                        "name": "id_name",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "zoo",
                        "table": "animals",
                      },
                      "name": {
                        "datatype": {
                          "group": "string",
                          "isArray": false,
                          "isNative": true,
                          "name": "varchar",
                          "options": [],
                          "schema": "pg_catalog",
                        },
                        "defaultValue": null,
                        "fkColumn": null,
                        "fkSchema": null,
                        "fkTable": null,
                        "isAutoincrement": false,
                        "isComputed": false,
                        "isRequired": false,
                        "name": "name",
                        "nullable": true,
                        "pkPosition": null,
                        "schema": "zoo",
                        "table": "animals",
                      },
                    },
                    "name": "animals",
                    "schema": "zoo",
                  },
                },
              },
            },
            "timezone": "GMT",
          },
        ]
      `);
    });
  });

  describe("updateMany", () => {
    it("updates multiple rows through the transactional executor path", async () => {
      const [introspectionError, introspection] = await adapter.introspect({});

      expect(introspectionError).toBeNull();

      const table = introspection?.schemas.public?.tables?.users;

      expect(table).toBeDefined();

      if (!table) {
        throw new Error("Expected public.users table in introspection");
      }
      const inserted = await pglite.query<{
        animal_id: number | null;
        created_at: string | null;
        id: number;
        role: "maintainer" | "member";
      }>(`
        insert into "public"."users" ("role")
        values ('member'), ('maintainer')
        returning "id", "created_at", "role", "animal_id"
      `);
      const insertedRows = inserted.rows;
      const ids = insertedRows.map((row) => row.id);

      if (!adapter.updateMany) {
        throw new Error("Expected adapter.updateMany to be available");
      }

      try {
        const [error, result] = await adapter.updateMany(
          {
            table,
            updates: [
              {
                changes: { role: "admin" },
                row: insertedRows[0]!,
                table,
              },
              {
                changes: { role: "member" },
                row: insertedRows[1]!,
                table,
              },
            ],
          },
          {},
        );

        expect(error).toBeNull();
        expect(result?.queries).toHaveLength(2);
        expect(result?.rows).toEqual([
          expect.objectContaining({
            id: insertedRows[0]!.id,
            role: "admin",
          }),
          expect.objectContaining({
            id: insertedRows[1]!.id,
            role: "member",
          }),
        ]);

        const persisted = await pglite.query<{ id: number; role: string }>(`
          select "id", "role"
          from "public"."users"
          where "id" in (${ids.join(", ")})
          order by "id"
        `);

        expect(persisted.rows).toEqual([
          { id: ids[0]!, role: "admin" },
          { id: ids[1]!, role: "member" },
        ]);
      } finally {
        await pglite.query(`
          delete from "public"."users"
          where "id" in (${ids.join(", ")})
        `);
      }
    });
  });

  describe("raw", () => {
    it("executes raw SQL and returns rows with rowCount", async () => {
      const [error, result] = await adapter.raw(
        {
          sql: "select 1 as one union all select 2 as one",
        },
        { abortSignal: new AbortController().signal },
      );

      expect(error).toBeNull();
      expect(result?.rowCount).toBe(2);
      expect(result?.rows).toEqual([{ one: 1 }, { one: 2 }]);
      expect(result?.query.sql).toBe("select 1 as one union all select 2 as one");
    });

    it("returns adapter errors for invalid SQL", async () => {
      const [error] = await adapter.raw(
        {
          sql: "select from",
        },
        { abortSignal: new AbortController().signal },
      );

      expect(error).not.toBeNull();
      expect(error?.query?.sql).toBe("select from");
    });
  });
});
