import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "reactflow";
import { Position } from "reactflow";

import type { EnumDiff, ModelDiff } from "./contract-diff";

const elk = new ELK();

const ELK_LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "SPLINES",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.spacing.nodeNode": "70",
} as const;

const NODE_WIDTH = 264;
const NODE_HEADER_HEIGHT = 52;
const NODE_ROW_HEIGHT = 26;
const NODE_DETAIL_ROW_HEIGHT = 20;
const NODE_CHIP_ROW_HEIGHT = 26;
const NODE_VERTICAL_PADDING = 24;
const ENUM_NODE_WIDTH = 190;

export interface ModelDiffNodeData {
  model: ModelDiff;
}

export interface EnumDiffNodeData {
  enumDiff: EnumDiff;
}

export type MigrationDiffNode =
  | Node<ModelDiffNodeData>
  | Node<EnumDiffNodeData>;

export function estimateModelNodeHeight(model: ModelDiff): number {
  const detailRows = model.fields.reduce(
    (sum, field) => sum + field.details.length,
    0,
  );
  const chipRows =
    model.addedIndexes.length +
      model.removedIndexes.length +
      model.addedRelations.length +
      model.removedRelations.length >
    0
      ? 1
      : 0;

  return (
    NODE_HEADER_HEIGHT +
    model.fields.length * NODE_ROW_HEIGHT +
    detailRows * NODE_DETAIL_ROW_HEIGHT +
    chipRows * NODE_CHIP_ROW_HEIGHT +
    NODE_VERTICAL_PADDING
  );
}

export function estimateEnumNodeHeight(enumDiff: EnumDiff): number {
  return (
    NODE_HEADER_HEIGHT +
    enumDiff.members.length * NODE_ROW_HEIGHT +
    NODE_VERTICAL_PADDING
  );
}

function estimateNodeSize(node: MigrationDiffNode): {
  height: number;
  width: number;
} {
  if (node.type === "enumDiff") {
    const data = node.data as EnumDiffNodeData;

    return {
      height: estimateEnumNodeHeight(data.enumDiff),
      width: ENUM_NODE_WIDTH,
    };
  }

  const data = node.data as ModelDiffNodeData;

  return {
    height: estimateModelNodeHeight(data.model),
    width: NODE_WIDTH,
  };
}

export function createModelDiffNode(model: ModelDiff): MigrationDiffNode {
  return {
    data: { model },
    id: `model:${model.name}`,
    position: { x: 0, y: 0 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: "modelDiff",
  };
}

export function createEnumDiffNode(enumDiff: EnumDiff): MigrationDiffNode {
  return {
    data: { enumDiff },
    id: `enum:${enumDiff.name}`,
    position: { x: 0, y: 0 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: "enumDiff",
  };
}

export async function layoutMigrationDiffNodes(
  nodes: MigrationDiffNode[],
  edges: Pick<Edge, "id" | "source" | "target">[],
): Promise<MigrationDiffNode[]> {
  if (nodes.length <= 1) {
    return nodes;
  }

  try {
    const layouted = await elk.layout({
      id: "root",
      layoutOptions: { ...ELK_LAYOUT_OPTIONS },
      children: nodes.map((node) => ({
        id: node.id,
        ...estimateNodeSize(node),
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    });

    const positions = new Map(
      (layouted.children ?? []).map((child) => [
        child.id,
        { x: child.x ?? 0, y: child.y ?? 0 },
      ]),
    );

    return nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    }));
  } catch {
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));

    return nodes.map((node, index) => ({
      ...node,
      position: {
        x: (index % columns) * (NODE_WIDTH + 90),
        y: Math.floor(index / columns) * 360,
      },
    }));
  }
}
