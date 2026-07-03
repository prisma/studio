import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "reactflow";
import { Position } from "reactflow";

import type { EnumDiff, MigrationDiff, ModelDiff } from "./contract-diff";

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

/**
 * Builds the React Flow graph for a migration diff.
 *
 * Default scope is the migration's story: touched models (their own
 * table changed, or a relation was added/removed), their direct
 * relation neighbors as dimmed context, and touched enums.
 * `showAllModels` widens the scope to every model and enum in the
 * migration's contract — unchanged ones render in the dimmed context
 * style.
 */
export function buildDiffGraph(
  diff: MigrationDiff,
  showAllModels: boolean,
): {
  nodes: MigrationDiffNode[];
  edges: Edge[];
} {
  const isTouched = (model: MigrationDiff["models"][number]) =>
    model.status !== "unchanged" ||
    model.addedRelations.length > 0 ||
    model.removedRelations.length > 0;
  const touchedModels = diff.models.filter(isTouched);
  const touchedNames = new Set(touchedModels.map((model) => model.name));
  const contextNames = new Set<string>();

  for (const model of touchedModels) {
    for (const relation of [...model.relations, ...model.removedRelations]) {
      if (!touchedNames.has(relation.toModel)) {
        contextNames.add(relation.toModel);
      }
    }
  }

  for (const model of diff.models) {
    if (touchedNames.has(model.name)) {
      continue;
    }

    if (
      model.relations.some((relation) => touchedNames.has(relation.toModel))
    ) {
      contextNames.add(model.name);
    }
  }

  const showEverything = showAllModels || touchedModels.length === 0;
  const visibleModels = showEverything
    ? diff.models
    : diff.models.filter(
        (model) =>
          touchedNames.has(model.name) || contextNames.has(model.name),
      );
  const visibleNames = new Set(visibleModels.map((model) => model.name));
  const visibleEnums = showEverything
    ? diff.enums
    : diff.enums.filter((enumDiff) => enumDiff.status !== "unchanged");

  const nodes: MigrationDiffNode[] = [
    ...visibleModels.map((model) => createModelDiffNode(model)),
    ...visibleEnums.map((enumDiff) => createEnumDiffNode(enumDiff)),
  ];

  const edges: Edge[] = [];
  const seenEdges = new Set<string>();

  for (const model of visibleModels) {
    const relationEntries = [
      ...model.relations.map((relation) => ({ relation, removed: false })),
      ...model.removedRelations.map((relation) => ({
        relation,
        removed: true,
      })),
    ];

    for (const { relation, removed } of relationEntries) {
      if (!visibleNames.has(relation.toModel)) {
        continue;
      }

      const pairKey = [model.name, relation.toModel].sort().join("↔");

      if (seenEdges.has(pairKey)) {
        continue;
      }

      seenEdges.add(pairKey);

      const added = model.addedRelations.some(
        (candidate) =>
          candidate.name === relation.name &&
          candidate.toModel === relation.toModel,
      );

      edges.push({
        id: `relation:${pairKey}`,
        source: `model:${model.name}`,
        target: `model:${relation.toModel}`,
        label: relation.cardinality,
        labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
        labelBgStyle: { fill: "var(--background)", fillOpacity: 0.8 },
        animated: added,
        style: {
          stroke: removed
            ? "var(--destructive)"
            : added
              ? "oklch(0.7 0.15 160)"
              : "var(--muted-foreground)",
          strokeDasharray: removed ? "3 3" : added ? undefined : "5 5",
          strokeWidth: added || removed ? 2 : 1,
          opacity: removed ? 0.7 : 0.9,
        },
        type: "default",
      });
    }
  }

  return { nodes, edges };
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
