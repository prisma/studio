import { describe, expect, it } from "vitest";

import {
  diffContracts,
  parseContractSnapshot,
  summarizeDiff,
} from "./contract-diff";

interface FieldSpec {
  codec?: string;
  nativeType?: string;
  nullable?: boolean;
  defaultValue?: unknown;
  enumName?: string;
}

interface ModelSpec {
  table?: string;
  primaryKey?: string[];
  fields: Record<string, FieldSpec>;
  relations?: Record<string, { toModel: string; cardinality?: string }>;
  indexes?: string[][];
  uniques?: string[][];
}

interface ContractSpec {
  models: Record<string, ModelSpec>;
  enums?: Record<string, string[]>;
}

function makeContract(spec: ContractSpec): unknown {
  const models: Record<string, unknown> = {};
  const tables: Record<string, unknown> = {};

  for (const [modelName, model] of Object.entries(spec.models)) {
    const table = model.table ?? modelName.toLowerCase();
    const fields: Record<string, unknown> = {};
    const storageFields: Record<string, unknown> = {};
    const columns: Record<string, unknown> = {};

    for (const [fieldName, field] of Object.entries(model.fields)) {
      fields[fieldName] = {
        nullable: field.nullable ?? false,
        type: { kind: "scalar", codecId: field.codec ?? "pg/text@1" },
        ...(field.enumName
          ? {
              valueSet: {
                entityKind: "enum",
                entityName: field.enumName,
                namespaceId: "public",
                plane: "domain",
              },
            }
          : {}),
      };
      storageFields[fieldName] = { column: fieldName };
      columns[fieldName] = {
        codecId: field.codec ?? "pg/text@1",
        nativeType: field.nativeType ?? "text",
        nullable: field.nullable ?? false,
        ...(field.defaultValue !== undefined
          ? {
              default:
                typeof field.defaultValue === "string" &&
                field.defaultValue.endsWith("()")
                  ? { kind: "function", expression: field.defaultValue }
                  : { kind: "literal", value: field.defaultValue },
            }
          : {}),
      };
    }

    const relations: Record<string, unknown> = {};

    for (const [relationName, relation] of Object.entries(
      model.relations ?? {},
    )) {
      relations[relationName] = {
        cardinality: relation.cardinality ?? "N:1",
        to: { model: relation.toModel, namespace: "public" },
        on: { localFields: ["id"], targetFields: ["id"] },
      };
    }

    models[modelName] = {
      fields,
      relations,
      storage: { fields: storageFields, namespaceId: "public", table },
    };
    tables[table] = {
      columns,
      primaryKey: { columns: model.primaryKey ?? ["id"] },
      indexes: (model.indexes ?? []).map((columnsList) => ({
        columns: columnsList,
      })),
      uniques: (model.uniques ?? []).map((columnsList) => ({
        columns: columnsList,
      })),
      foreignKeys: [],
    };
  }

  const enums: Record<string, unknown> = {};

  for (const [enumName, members] of Object.entries(spec.enums ?? {})) {
    enums[enumName] = {
      codecId: "pg/text@1",
      members: members.map((member) => ({ name: member, value: member })),
    };
  }

  return {
    schemaVersion: "1",
    targetFamily: "sql",
    target: "postgres",
    domain: { namespaces: { public: { models, enum: enums } } },
    storage: {
      namespaces: { public: { entries: { table: tables }, id: "public" } },
    },
  };
}

const baseUser: ModelSpec = {
  table: "user",
  fields: {
    id: { codec: "pg/uuid@1", nativeType: "uuid" },
    email: {},
    name: {},
  },
};

describe("parseContractSnapshot", () => {
  it("normalizes models, fields, and storage details", () => {
    const snapshot = parseContractSnapshot(
      makeContract({
        models: {
          User: {
            ...baseUser,
            fields: {
              ...baseUser.fields,
              createdAt: {
                codec: "pg/timestamptz@1",
                nativeType: "timestamptz",
                defaultValue: "now()",
              },
            },
          },
        },
      }),
    );

    const user = snapshot.models.get("User");
    expect(user).toBeDefined();
    expect(user?.table).toBe("user");
    expect(user?.fields.map((field) => field.name)).toEqual([
      "id",
      "createdAt",
      "email",
      "name",
    ]);
    expect(user?.fields[0]?.isPrimaryKey).toBe(true);
    expect(user?.fields[0]?.type).toBe("uuid");

    const createdAt = user?.fields.find((field) => field.name === "createdAt");
    expect(createdAt?.defaultValue).toBe("now()");
  });

  it("returns an empty snapshot for malformed documents", () => {
    expect(parseContractSnapshot(null).models.size).toBe(0);
    expect(parseContractSnapshot("garbage").models.size).toBe(0);
    expect(parseContractSnapshot({ domain: 42 }).models.size).toBe(0);
  });
});

describe("diffContracts", () => {
  it("marks every model and enum as added for a baseline migration", () => {
    const diff = diffContracts(
      null,
      makeContract({
        models: { User: baseUser },
        enums: { Priority: ["low", "high"] },
      }),
    );

    expect(diff.models).toHaveLength(1);
    expect(diff.models[0]?.status).toBe("added");
    expect(diff.enums[0]?.status).toBe("added");
    expect(diff.stats.modelsAdded).toBe(1);
    expect(diff.stats.enumsAdded).toBe(1);
  });

  it("detects an added model without counting its fields as field additions", () => {
    const before = makeContract({ models: { User: baseUser } });
    const after = makeContract({
      models: {
        User: baseUser,
        Post: {
          fields: {
            id: { codec: "pg/uuid@1", nativeType: "uuid" },
            title: {},
          },
        },
      },
    });

    const diff = diffContracts(before, after);
    const post = diff.models.find((model) => model.name === "Post");

    expect(post?.status).toBe("added");
    expect(diff.stats.modelsAdded).toBe(1);
    expect(diff.stats.fieldsAdded).toBe(0);
  });

  it("detects a removed model", () => {
    const before = makeContract({
      models: {
        User: baseUser,
        AuditLog: { fields: { id: { codec: "pg/uuid@1" } } },
      },
    });
    const after = makeContract({ models: { User: baseUser } });

    const diff = diffContracts(before, after);
    const auditLog = diff.models.find((model) => model.name === "AuditLog");

    expect(auditLog?.status).toBe("removed");
    expect(diff.stats.modelsRemoved).toBe(1);
  });

  it("detects added and removed fields on a changed model", () => {
    const before = makeContract({ models: { User: baseUser } });
    const after = makeContract({
      models: {
        User: {
          ...baseUser,
          fields: {
            id: baseUser.fields.id as FieldSpec,
            email: {},
            bio: { nullable: true },
          },
        },
      },
    });

    const diff = diffContracts(before, after);
    const user = diff.models.find((model) => model.name === "User");

    expect(user?.status).toBe("changed");
    expect(user?.fields.find((field) => field.name === "bio")?.status).toBe(
      "added",
    );
    expect(user?.fields.find((field) => field.name === "name")?.status).toBe(
      "removed",
    );
    expect(diff.stats.fieldsAdded).toBe(1);
    expect(diff.stats.fieldsRemoved).toBe(1);
  });

  it("reports how a field changed (type, nullability, default)", () => {
    const before = makeContract({
      models: {
        Task: {
          fields: {
            id: { codec: "pg/uuid@1", nativeType: "uuid" },
            status: { defaultValue: "open" },
            dueAt: {
              codec: "pg/timestamptz@1",
              nativeType: "timestamptz",
            },
          },
        },
      },
    });
    const after = makeContract({
      models: {
        Task: {
          fields: {
            id: { codec: "pg/uuid@1", nativeType: "uuid" },
            status: { defaultValue: "todo" },
            dueAt: {
              codec: "pg/timestamptz@1",
              nativeType: "timestamptz",
              nullable: true,
            },
          },
        },
      },
    });

    const diff = diffContracts(before, after);
    const task = diff.models.find((model) => model.name === "Task");
    const status = task?.fields.find((field) => field.name === "status");
    const dueAt = task?.fields.find((field) => field.name === "dueAt");

    expect(status?.status).toBe("changed");
    expect(status?.details).toEqual([
      { aspect: "default", before: '"open"', after: '"todo"' },
    ]);
    expect(dueAt?.status).toBe("changed");
    expect(dueAt?.details).toEqual([
      { aspect: "nullable", before: "required", after: "optional" },
    ]);
    expect(diff.stats.fieldsChanged).toBe(2);
  });

  it("detects index and unique changes", () => {
    const before = makeContract({ models: { User: baseUser } });
    const after = makeContract({
      models: {
        User: { ...baseUser, uniques: [["email"]], indexes: [["name"]] },
      },
    });

    const diff = diffContracts(before, after);
    const user = diff.models.find((model) => model.name === "User");

    expect(user?.status).toBe("changed");
    expect(user?.addedIndexes).toEqual(["index(name)", "unique(email)"]);
    expect(diff.stats.indexesAdded).toBe(2);
  });

  it("diffs enum members", () => {
    const before = makeContract({
      models: { User: baseUser },
      enums: { Priority: ["low", "high"] },
    });
    const after = makeContract({
      models: { User: baseUser },
      enums: { Priority: ["low", "medium", "high"] },
    });

    const diff = diffContracts(before, after);
    const priority = diff.enums.find((value) => value.name === "Priority");

    expect(priority?.status).toBe("changed");
    expect(
      priority?.members.find((member) => member.name === "medium")?.status,
    ).toBe("added");
  });

  it("detects added relations", () => {
    const before = makeContract({
      models: { User: baseUser, Post: { fields: { id: {} } } },
    });
    const after = makeContract({
      models: {
        User: baseUser,
        Post: {
          fields: { id: {}, authorId: { codec: "pg/uuid@1" } },
          relations: { author: { toModel: "User" } },
        },
      },
    });

    const diff = diffContracts(before, after);
    const post = diff.models.find((model) => model.name === "Post");

    expect(post?.addedRelations).toHaveLength(1);
    expect(post?.addedRelations[0]?.toModel).toBe("User");
  });

  it("leaves untouched models unchanged", () => {
    const contract = makeContract({
      models: { User: baseUser, Post: { fields: { id: {} } } },
    });

    const diff = diffContracts(contract, contract);

    expect(diff.models.every((model) => model.status === "unchanged")).toBe(
      true,
    );
    expect(diff.stats.modelsChanged).toBe(0);
  });
});

describe("summarizeDiff", () => {
  it("renders compact chips for the changed dimensions", () => {
    const diff = diffContracts(
      makeContract({ models: { User: baseUser } }),
      makeContract({
        models: {
          User: { ...baseUser, uniques: [["email"]] },
          Post: { fields: { id: {} } },
        },
        enums: { Priority: ["low"] },
      }),
    );

    expect(summarizeDiff(diff.stats)).toEqual([
      "+1 model",
      "~1 model",
      "+1 enum",
      "+1 index",
    ]);
  });
});
