import { describe, expect, it } from "vitest";

import type { EnumDiff, MigrationDiff, ModelDiff } from "./contract-diff";
import { buildDiffGraph } from "./diff-layout";

function model(
  name: string,
  overrides: Partial<ModelDiff> = {},
): ModelDiff {
  return {
    name,
    status: "unchanged",
    table: name.toLowerCase(),
    fields: [],
    addedIndexes: [],
    removedIndexes: [],
    addedRelations: [],
    removedRelations: [],
    relations: [],
    ...overrides,
  };
}

function enumDiff(
  name: string,
  overrides: Partial<EnumDiff> = {},
): EnumDiff {
  return {
    name,
    status: "unchanged",
    members: [{ name: "low", status: "unchanged" }],
    ...overrides,
  };
}

function diff(models: ModelDiff[], enums: EnumDiff[] = []): MigrationDiff {
  return {
    models,
    enums,
    stats: {
      modelsAdded: 0,
      modelsRemoved: 0,
      modelsChanged: 0,
      fieldsAdded: 0,
      fieldsRemoved: 0,
      fieldsChanged: 0,
      enumsAdded: 0,
      enumsRemoved: 0,
      indexesAdded: 0,
      indexesRemoved: 0,
    },
  };
}

function nodeIds(graph: { nodes: Array<{ id: string }> }): string[] {
  return graph.nodes.map((node) => node.id).sort();
}

describe("buildDiffGraph", () => {
  const migration = diff(
    [
      model("Comment", {
        status: "added",
        relations: [
          { name: "task", toModel: "Task", cardinality: "N:1" },
          { name: "author", toModel: "User", cardinality: "N:1" },
        ],
      }),
      model("Task"),
      model("User"),
      model("Tag"),
    ],
    [enumDiff("Priority")],
  );

  it("scopes to touched models, their neighbors, and touched enums by default", () => {
    const graph = buildDiffGraph(migration, false);

    expect(nodeIds(graph)).toEqual([
      "model:Comment",
      "model:Task",
      "model:User",
    ]);
  });

  it("includes every model and unchanged enums when showing all models", () => {
    const graph = buildDiffGraph(migration, true);

    expect(nodeIds(graph)).toEqual([
      "enum:Priority",
      "model:Comment",
      "model:Tag",
      "model:Task",
      "model:User",
    ]);
  });

  it("always includes touched enums, even in the scoped view", () => {
    const graph = buildDiffGraph(
      diff(
        [model("Task", { status: "changed" })],
        [enumDiff("TaskStatus", { status: "added" }), enumDiff("Priority")],
      ),
      false,
    );

    expect(nodeIds(graph)).toEqual(["enum:TaskStatus", "model:Task"]);
  });

  it("treats a relation-only model as touched for scoping without amber status", () => {
    const graph = buildDiffGraph(
      diff([
        model("User", {
          addedRelations: [
            { name: "projects", toModel: "Project", cardinality: "1:N" },
          ],
          relations: [
            { name: "projects", toModel: "Project", cardinality: "1:N" },
          ],
        }),
        model("Project", { status: "added" }),
        model("Tag"),
      ]),
      false,
    );

    expect(nodeIds(graph)).toEqual(["model:Project", "model:User"]);

    const edge = graph.edges.find((candidate) =>
      candidate.id.includes("Project"),
    );

    expect(edge?.animated).toBe(true);
  });

  it("falls back to the full schema when a migration touches nothing", () => {
    const graph = buildDiffGraph(
      diff([model("User"), model("Tag")], [enumDiff("Priority")]),
      false,
    );

    expect(nodeIds(graph)).toEqual([
      "enum:Priority",
      "model:Tag",
      "model:User",
    ]);
  });
});
