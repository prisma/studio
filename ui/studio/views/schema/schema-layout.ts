import ELK from "elkjs/lib/elk.bundled.js";
import { type Edge, type Node, Position } from "reactflow";

import type {
  Field,
  Relationship,
  Table,
} from "../../../hooks/use-schema-visualization";

const elk = new ELK();
const SCHEMA_VISUALIZER_LAYOUT_VERSION = 2;

const ELK_LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.spacing.edgeNodeBetweenLayers": "80",
  "elk.layered.spacing.nodeNodeBetweenLayers": "180",
  "elk.spacing.edgeNode": "60",
  "elk.spacing.nodeNode": "140",
} as const;

const FALLBACK_GRID_GAP_X = 350;
const FALLBACK_GRID_GAP_Y = 300;
const FALLBACK_HORIZONTAL_GAP_X = 350;
const FALLBACK_HORIZONTAL_START_Y = 50;
const FALLBACK_MAX_SIMPLE_LAYOUT_TABLES = 3;
const COMPONENT_GAP_X = 220;
const COMPONENT_GAP_Y = 180;
const NODE_WIDTH = 280;
const NODE_MAX_WIDTH = 360;
const NODE_HEADER_HEIGHT = 56;
const NODE_ROW_HEIGHT = 32;
const NODE_EMPTY_STATE_HEIGHT = 120;
const NODE_VERTICAL_PADDING = 16;
const NODE_HORIZONTAL_PADDING = 84;
const NODE_CHARACTER_WIDTH = 8;

interface ElkGraphChild {
  height: number;
  id: string;
  width: number;
}

interface ElkGraphEdge {
  id: string;
  sources: string[];
  targets: string[];
}

interface ElkLayoutGraph {
  children: ElkGraphChild[];
  edges: ElkGraphEdge[];
  id: string;
  layoutOptions: Record<string, string>;
}

interface ElkLayoutResultNode {
  id: string;
  x?: number;
  y?: number;
}

interface ElkLayoutResult {
  children?: ElkLayoutResultNode[];
}

export interface SchemaNodeData {
  fields: Field[];
  label: string;
}

export type SchemaNode = Node<SchemaNodeData>;
export interface SchemaNodePosition {
  x: number;
  y: number;
}

export type SchemaNodePositions = Record<string, SchemaNodePosition>;

export interface LayoutEngine {
  layout(graph: ElkLayoutGraph): Promise<ElkLayoutResult>;
}

interface LayoutedSchemaComponent {
  bounds: {
    height: number;
    width: number;
  };
  nodes: SchemaNode[];
}

type SchemaLayoutEdge = Pick<Edge, "id" | "label" | "source" | "target">;

function createSchemaNode(
  table: Table,
  position: { x: number; y: number },
): SchemaNode {
  return {
    data: {
      fields: table.fields,
      label: table.name,
    },
    id: table.name,
    position,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    type: "tableNode",
  };
}

function estimateNodeHeight(node: SchemaNode): number {
  if (node.data.label === "No Tables Found") {
    return NODE_EMPTY_STATE_HEIGHT;
  }

  return (
    NODE_HEADER_HEIGHT +
    node.data.fields.length * NODE_ROW_HEIGHT +
    NODE_VERTICAL_PADDING
  );
}

function estimateNodeWidth(node: SchemaNode): number {
  const contentWidth = Math.max(
    node.data.label.length * NODE_CHARACTER_WIDTH + NODE_HORIZONTAL_PADDING,
    ...node.data.fields.map(
      (field) =>
        (field.name.length + field.type.length) * NODE_CHARACTER_WIDTH +
        NODE_HORIZONTAL_PADDING,
    ),
  );

  return Math.max(NODE_WIDTH, Math.min(NODE_MAX_WIDTH, contentWidth));
}

function getSchemaNodeIds(tables: Pick<Table, "name">[]): string[] {
  return tables
    .map((table) => table.name)
    .sort((left, right) => left.localeCompare(right));
}

function getSchemaLayoutNodeIds(nodes: Pick<SchemaNode, "id">[]): string[] {
  return [...nodes]
    .map((node) => node.id)
    .sort((left, right) => left.localeCompare(right));
}

function getLayoutComponentBounds(nodes: SchemaNode[]) {
  const horizontalBounds = nodes.map((node) => ({
    left: node.position.x,
    right: node.position.x + estimateNodeWidth(node),
  }));
  const verticalBounds = nodes.map((node) => ({
    bottom: node.position.y + estimateNodeHeight(node),
    top: node.position.y,
  }));

  const left = Math.min(...horizontalBounds.map((bound) => bound.left));
  const right = Math.max(...horizontalBounds.map((bound) => bound.right));
  const top = Math.min(...verticalBounds.map((bound) => bound.top));
  const bottom = Math.max(...verticalBounds.map((bound) => bound.bottom));

  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

function normalizeLayoutedComponentNodes(
  nodes: SchemaNode[],
): LayoutedSchemaComponent {
  const bounds = getLayoutComponentBounds(nodes);

  return {
    bounds: {
      height: bounds.height,
      width: bounds.width,
    },
    nodes: nodes.map((node) => ({
      ...node,
      position: {
        x: node.position.x - bounds.left,
        y: node.position.y - bounds.top,
      },
    })),
  };
}

function offsetLayoutedComponentNodes(
  component: LayoutedSchemaComponent,
  offset: { x: number; y: number },
): SchemaNode[] {
  return component.nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + offset.x,
      y: node.position.y + offset.y,
    },
  }));
}

function splitSchemaLayoutComponents(
  nodes: SchemaNode[],
  edges: SchemaLayoutEdge[],
): Array<{ edges: SchemaLayoutEdge[]; nodes: SchemaNode[] }> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(
    nodes.map((node) => [node.id, new Set<string>()] as const),
  );

  edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });

  const remainingNodeIds = new Set(nodesById.keys());
  const components: Array<{ edges: SchemaLayoutEdge[]; nodes: SchemaNode[] }> =
    [];

  while (remainingNodeIds.size > 0) {
    const [rootId] = remainingNodeIds;

    if (!rootId) {
      break;
    }

    const stack = [rootId];
    const componentNodeIds = new Set<string>();

    while (stack.length > 0) {
      const nodeId = stack.pop();

      if (!nodeId || componentNodeIds.has(nodeId)) {
        continue;
      }

      componentNodeIds.add(nodeId);
      remainingNodeIds.delete(nodeId);

      adjacency.get(nodeId)?.forEach((neighborId) => {
        if (!componentNodeIds.has(neighborId)) {
          stack.push(neighborId);
        }
      });
    }

    components.push({
      edges: edges.filter(
        (edge) =>
          componentNodeIds.has(edge.source) &&
          componentNodeIds.has(edge.target),
      ),
      nodes: getSchemaLayoutNodeIds(
        [...componentNodeIds].map((nodeId) => ({ id: nodeId })),
      )
        .map((nodeId) => nodesById.get(nodeId))
        .filter((node): node is SchemaNode => node != null),
    });
  }

  return components;
}

async function getLayoutedSchemaComponent(
  nodes: SchemaNode[],
  edges: SchemaLayoutEdge[],
  layoutEngine: LayoutEngine,
): Promise<LayoutedSchemaComponent> {
  if (nodes.length <= 1) {
    return normalizeLayoutedComponentNodes(
      nodes.map((node) => ({
        ...node,
        position: { x: 0, y: 0 },
      })),
    );
  }

  const layoutedGraph = await layoutEngine.layout({
    children: nodes.map((node) => ({
      height: estimateNodeHeight(node),
      id: node.id,
      width: estimateNodeWidth(node),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
    id: "root",
    layoutOptions: { ...ELK_LAYOUT_OPTIONS },
  });

  const positionsById = new Map(
    (layoutedGraph.children ?? []).map((node) => [
      node.id,
      {
        x: node.x ?? 0,
        y: node.y ?? 0,
      },
    ]),
  );

  return normalizeLayoutedComponentNodes(
    nodes.map((node) => ({
      ...node,
      position: positionsById.get(node.id) ?? node.position,
    })),
  );
}

function packLayoutedSchemaComponents(
  components: LayoutedSchemaComponent[],
): SchemaNode[] {
  if (components.length === 0) {
    return [];
  }

  const totalArea = components.reduce(
    (sum, component) => sum + component.bounds.width * component.bounds.height,
    0,
  );
  const maxComponentWidth = Math.max(
    ...components.map((component) => component.bounds.width),
  );
  const targetRowWidth = Math.max(
    maxComponentWidth,
    Math.sqrt(totalArea) * 1.4,
  );

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  return [...components]
    .sort((left, right) => {
      const heightDelta = right.bounds.height - left.bounds.height;

      if (heightDelta !== 0) {
        return heightDelta;
      }

      return getSchemaLayoutNodeIds(left.nodes)[0]!.localeCompare(
        getSchemaLayoutNodeIds(right.nodes)[0]!,
      );
    })
    .flatMap((component) => {
      if (cursorX > 0 && cursorX + component.bounds.width > targetRowWidth) {
        cursorX = 0;
        cursorY += rowHeight + COMPONENT_GAP_Y;
        rowHeight = 0;
      }

      const offset = { x: cursorX, y: cursorY };

      cursorX += component.bounds.width + COMPONENT_GAP_X;
      rowHeight = Math.max(rowHeight, component.bounds.height);

      return offsetLayoutedComponentNodes(component, offset);
    });
}

export function createFallbackLayoutedSchemaNodes(
  tables: Table[],
): SchemaNode[] {
  if (tables.length <= FALLBACK_MAX_SIMPLE_LAYOUT_TABLES) {
    return tables.map((table, index) =>
      createSchemaNode(table, {
        x: FALLBACK_HORIZONTAL_GAP_X * index,
        y: FALLBACK_HORIZONTAL_START_Y,
      }),
    );
  }

  const columns = Math.ceil(Math.sqrt(tables.length));

  return tables.map((table, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    return createSchemaNode(table, {
      x: column * FALLBACK_GRID_GAP_X,
      y: row * FALLBACK_GRID_GAP_Y,
    });
  });
}

export function createSchemaEdges(relationships: Relationship[]): Edge[] {
  return relationships.map((relationship, index) => ({
    animated: true,
    id: `e${index}`,
    label: relationship.type,
    labelStyle: {
      fill: "var(--primary)",
      fontSize: 12,
    },
    source: relationship.from,
    style: {
      stroke: "var(--primary)",
      strokeDasharray: "5 5",
      strokeWidth: 1,
    },
    target: relationship.to,
    type: "step",
  }));
}

export function createSchemaLayoutSignature(
  nodes: SchemaNode[],
  edges: Pick<Edge, "label" | "source" | "target">[],
): string {
  return JSON.stringify({
    version: SCHEMA_VISUALIZER_LAYOUT_VERSION,
    edges: edges
      .map((edge) => ({
        label: String(edge.label ?? ""),
        source: edge.source,
        target: edge.target,
      }))
      .sort((left, right) =>
        `${left.source}:${left.target}:${left.label}`.localeCompare(
          `${right.source}:${right.target}:${right.label}`,
        ),
      ),
    nodes: [...nodes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => ({
        fieldCount: node.data.fields.length,
        id: node.id,
        label: node.data.label,
      })),
  });
}

export function createSchemaVisualizerStateScope(
  schemaName: string | undefined,
  tables: Pick<Table, "name">[],
): string {
  return `${schemaName ?? "__unknown__"}:${
    getSchemaNodeIds(tables).join("|") || "__empty__"
  }`;
}

export function createSchemaVisualizerUiStateKey(
  stateScope: string,
  key: string,
): string {
  return `schema-visualizer:${stateScope}:${key}`;
}

export function createSchemaNodePositions(
  nodes: Pick<SchemaNode, "id" | "position">[],
): SchemaNodePositions {
  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        x: node.position.x,
        y: node.position.y,
      },
    ]),
  );
}

export function applySchemaNodePositions(
  nodes: SchemaNode[],
  positions: SchemaNodePositions,
): SchemaNode[] {
  return nodes.map((node) => ({
    ...node,
    position: positions[node.id] ?? node.position,
  }));
}

export function hasSchemaNodePositionsForAllNodes(
  nodes: Pick<SchemaNode, "id">[],
  positions: SchemaNodePositions,
): boolean {
  return nodes.every((node) => positions[node.id] != null);
}

export function doSchemaNodePositionsDiffer(
  nodeIds: string[],
  currentPositions: SchemaNodePositions,
  referencePositions: SchemaNodePositions,
): boolean {
  return nodeIds.some((nodeId) => {
    const currentPosition = currentPositions[nodeId];
    const referencePosition = referencePositions[nodeId];

    if (!currentPosition || !referencePosition) {
      return false;
    }

    return (
      currentPosition.x !== referencePosition.x ||
      currentPosition.y !== referencePosition.y
    );
  });
}

export async function getAutoLayoutedSchemaNodes(
  nodes: SchemaNode[],
  edges: SchemaLayoutEdge[],
  layoutEngine: LayoutEngine = elk,
): Promise<SchemaNode[]> {
  const layoutedComponents = await Promise.all(
    splitSchemaLayoutComponents(nodes, edges).map((component) =>
      getLayoutedSchemaComponent(
        component.nodes,
        component.edges,
        layoutEngine,
      ),
    ),
  );

  return packLayoutedSchemaComponents(layoutedComponents);
}
