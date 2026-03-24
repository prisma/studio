import { Position } from "reactflow";
import { describe, expect, it, vi } from "vitest";

import type { Table } from "../../../hooks/use-schema-visualization";
import {
  doSchemaNodePositionsDiffer,
  getAutoLayoutedSchemaNodes,
  type LayoutEngine,
} from "./schema-layout";

function createTable(name: string, fieldCount: number): Table {
  return {
    fields: Array.from({ length: fieldCount }, (_, index) => ({
      name: `${name}_field_${index}`,
      type: "text",
    })),
    name,
  };
}

describe("schema-layout", () => {
  it("packs disconnected components without overlapping their bounds", async () => {
    const tables = [
      createTable("all_data_types", 32),
      createTable("organizations", 6),
      createTable("feature_flags", 7),
      createTable("team_members", 8),
    ];
    const baseNodes = tables.map((table) => ({
      data: {
        fields: table.fields,
        label: table.name,
      },
      id: table.name,
      position: { x: 0, y: 0 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      type: "tableNode",
    }));
    const edges = [
      {
        id: "organizations-feature_flags",
        label: "1:n",
        source: "organizations",
        target: "feature_flags",
      },
      {
        id: "organizations-team_members",
        label: "1:n",
        source: "organizations",
        target: "team_members",
      },
    ];
    const layout: LayoutEngine["layout"] = vi
      .fn()
      .mockImplementation((graph: Parameters<LayoutEngine["layout"]>[0]) =>
        Promise.resolve({
          children:
            graph.children.length === 1
              ? [{ id: "all_data_types", x: 0, y: 0 }]
              : [
                  { id: "organizations", x: 0, y: 0 },
                  { id: "feature_flags", x: 0, y: 280 },
                  { id: "team_members", x: 380, y: 280 },
                ],
        }),
      );

    const nodes = await getAutoLayoutedSchemaNodes(baseNodes, edges, {
      layout,
    });

    const allDataTypesNode = nodes.find((node) => node.id === "all_data_types");
    const organizationsNode = nodes.find((node) => node.id === "organizations");

    expect(allDataTypesNode).toBeDefined();
    expect(organizationsNode).toBeDefined();
    expect(layout).toHaveBeenCalledTimes(1);
    expect(organizationsNode!.position.x).toBeGreaterThanOrEqual(500);
  });

  it("detects when current positions diverge from the stored auto layout", () => {
    expect(
      doSchemaNodePositionsDiffer(
        ["users", "posts"],
        {
          posts: { x: 420, y: 220 },
          users: { x: 333, y: 444 },
        },
        {
          posts: { x: 420, y: 220 },
          users: { x: 120, y: 80 },
        },
      ),
    ).toBe(true);

    expect(
      doSchemaNodePositionsDiffer(
        ["users", "posts"],
        {
          posts: { x: 420, y: 220 },
          users: { x: 120, y: 80 },
        },
        {
          posts: { x: 420, y: 220 },
          users: { x: 120, y: 80 },
        },
      ),
    ).toBe(false);
  });
});
