import { describe, expect, it } from "vitest";

import { parseContractSnapshot } from "./contract-diff";
import {
  diffSchemas,
  renderPslSchema,
  schemaDiffHasChanges,
} from "./psl-schema";

function contract(overrides: {
  models?: Record<string, unknown>;
  enums?: Record<string, unknown>;
  tables?: Record<string, unknown>;
}): unknown {
  return {
    domain: {
      namespaces: {
        public: {
          models: overrides.models ?? {},
          enum: overrides.enums ?? {},
        },
      },
    },
    storage: {
      namespaces: {
        public: { entries: { table: overrides.tables ?? {} }, id: "public" },
      },
    },
  };
}

const userContract = contract({
  models: {
    User: {
      fields: {
        id: {
          nullable: false,
          type: { kind: "scalar", codecId: "pg/uuid@1" },
        },
        email: {
          nullable: false,
          type: { kind: "scalar", codecId: "pg/text@1" },
        },
        bio: {
          nullable: true,
          type: { kind: "scalar", codecId: "pg/text@1" },
        },
        kind: {
          nullable: false,
          type: { kind: "scalar", codecId: "pg/text@1" },
          valueSet: {
            entityKind: "enum",
            entityName: "UserKind",
            namespaceId: "public",
            plane: "domain",
          },
        },
      },
      relations: {
        posts: {
          cardinality: "1:N",
          to: { model: "Post", namespace: "public" },
          on: { localFields: ["id"], targetFields: ["userId"] },
        },
      },
      storage: {
        fields: {
          id: { column: "id" },
          email: { column: "email" },
          bio: { column: "bio" },
          kind: { column: "kind" },
        },
        namespaceId: "public",
        table: "user",
      },
    },
  },
  enums: {
    UserKind: {
      codecId: "pg/text@1",
      members: [
        { name: "admin", value: "admin" },
        { name: "member", value: "member" },
      ],
    },
  },
  tables: {
    user: {
      columns: {
        id: {
          codecId: "pg/uuid@1",
          nativeType: "uuid",
          nullable: false,
          default: { kind: "function", expression: "gen_random_uuid()" },
        },
        email: { codecId: "pg/text@1", nativeType: "text", nullable: false },
        bio: { codecId: "pg/text@1", nativeType: "text", nullable: true },
        kind: {
          codecId: "pg/text@1",
          nativeType: "text",
          nullable: false,
          default: { kind: "literal", value: "member" },
        },
      },
      primaryKey: { columns: ["id"] },
      uniques: [{ columns: ["email"] }],
      indexes: [],
      foreignKeys: [],
    },
  },
});

describe("renderPslSchema", () => {
  it("renders enums, models, fields, defaults, relations, and block attributes", () => {
    const schema = renderPslSchema(parseContractSnapshot(userContract));

    expect(schema).toBe(
      [
        "enum UserKind {",
        "  admin",
        "  member",
        "}",
        "",
        "model User {",
        "  id String @id @default(uuid()) @db.Uuid",
        "  bio String?",
        "  email String",
        '  kind UserKind @default("member")',
        "",
        "  posts Post[]",
        "",
        "  @@unique([email])",
        '  @@map("user")',
        "}",
      ].join("\n"),
    );
  });

  it("renders an empty snapshot as an empty schema", () => {
    expect(renderPslSchema(parseContractSnapshot(null))).toBe("");
  });
});

describe("diffSchemas", () => {
  it("marks added and removed lines", () => {
    const before = "model User {\n  id String @id\n}";
    const after = "model User {\n  id String @id\n  bio String?\n}";

    const lines = diffSchemas(before, after);

    expect(lines).toEqual([
      { kind: "context", text: "model User {" },
      { kind: "context", text: "  id String @id" },
      { kind: "added", text: "  bio String?" },
      { kind: "context", text: "}" },
    ]);
    expect(schemaDiffHasChanges(lines)).toBe(true);
  });

  it("collapses long unchanged runs around the changes", () => {
    const stable = Array.from({ length: 12 }, (_, i) => `  line${i}`);
    const before = ["model A {", ...stable, "}"].join("\n");
    const after = ["model A {", ...stable, "  extra Int", "}"].join("\n");

    const lines = diffSchemas(before, after);
    const collapsed = lines.find((line) => line.kind === "collapsed");

    expect(collapsed?.hiddenCount).toBeGreaterThan(6);
    expect(lines.filter((line) => line.kind === "added")).toHaveLength(1);
  });

  it("reports no changes for identical schemas", () => {
    const schema = "model User {\n  id String @id\n}";

    expect(schemaDiffHasChanges(diffSchemas(schema, schema))).toBe(false);
  });
});
