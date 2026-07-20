import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "reactflow";
import { Position } from "reactflow";

import {
  type ComposeEdge,
  type ComposeGraph,
  type ComposeHealth,
  type ComposeNode,
  deriveHealth,
} from "./compose-data";

const elk = new ELK();

const ELK_LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "SPLINES",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.spacing.nodeNodeBetweenLayers": "110",
  "elk.spacing.nodeNode": "56",
} as const;

const NODE_WIDTH = 224;

export interface ComposeNodeData {
  node: ComposeNode;
  health: ComposeHealth;
  /** Requests per second flowing out of / into this node this tick. */
  outRps: number;
  inRps: number;
  p95Ms: number;
}

export type ComposeFlowNode = Node<ComposeNodeData>;

/**
 * Builds the ReactFlow node/edge sets for one traffic tick. Node ids are
 * stable across ticks so the single canvas instance updates in place —
 * only the data payloads and edge styling change (same persistent-canvas
 * approach as the Migrations diff view).
 */
export function buildComposeFlow(graph: ComposeGraph): {
  nodes: ComposeFlowNode[];
  edges: Edge[];
} {
  const nodes: ComposeFlowNode[] = graph.nodes.map((node) => {
    const touching = graph.edges.filter(
      (candidate) =>
        candidate.source === node.id || candidate.target === node.id,
    );
    const outRps = touching
      .filter((candidate) => candidate.source === node.id)
      .reduce((sum, candidate) => sum + candidate.traffic.rps, 0);
    const inRps = touching
      .filter((candidate) => candidate.target === node.id)
      .reduce((sum, candidate) => sum + candidate.traffic.rps, 0);
    const p95Ms = touching.reduce(
      (max, candidate) => Math.max(max, candidate.traffic.p95Ms),
      0,
    );

    return {
      id: `compose:${node.id}`,
      type: node.kind === "service" ? "composeService" : "composeModule",
      position: { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        node,
        health: deriveHealth(node, graph.edges),
        outRps: Math.round(outRps * 10) / 10,
        inRps: Math.round(inRps * 10) / 10,
        p95Ms,
      },
    };
  });

  const edges: Edge[] = graph.edges.map((composeEdge) => ({
    id: `compose-edge:${composeEdge.id}`,
    source: `compose:${composeEdge.source}`,
    target: `compose:${composeEdge.target}`,
    label: `${composeEdge.traffic.rps} rps`,
    labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--background)", fillOpacity: 0.75 },
    animated: composeEdge.traffic.rps > 0.5,
    style: {
      stroke: edgeStroke(composeEdge),
      strokeWidth: edgeWidth(composeEdge.traffic.rps),
      opacity: 0.9,
    },
    type: "default",
  }));

  return { nodes, edges };
}

/** Log-ish scaling so a 40 rps boundary doesn't dwarf a 2 rps one. */
export function edgeWidth(rps: number): number {
  return Math.min(4.5, 1 + Math.log10(1 + rps) * 1.6);
}

export function edgeStroke(composeEdge: ComposeEdge): string {
  if (composeEdge.traffic.errorRate >= 0.04) {
    return "var(--destructive)";
  }

  if (composeEdge.traffic.errorRate >= 0.015) {
    return "oklch(0.75 0.15 75)";
  }

  return "oklch(0.7 0.12 160)";
}

function estimateNodeHeight(node: ComposeFlowNode): number {
  return node.data.node.kind === "ingress" ? 72 : 118;
}

export async function layoutComposeNodes(
  nodes: ComposeFlowNode[],
  edges: Pick<Edge, "id" | "source" | "target">[],
): Promise<ComposeFlowNode[]> {
  if (nodes.length <= 1) {
    return nodes;
  }

  try {
    const layouted = await elk.layout({
      id: "root",
      layoutOptions: { ...ELK_LAYOUT_OPTIONS },
      children: nodes.map((node) => ({
        id: node.id,
        width: NODE_WIDTH,
        height: estimateNodeHeight(node),
      })),
      edges: edges.map((candidate) => ({
        id: candidate.id,
        sources: [candidate.source],
        targets: [candidate.target],
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
  } catch (error) {
    console.warn(
      "[compose] ELK layout failed; falling back to grid placement",
      error,
    );
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));

    return nodes.map((node, index) => ({
      ...node,
      position: {
        x: (index % columns) * (NODE_WIDTH + 80),
        y: Math.floor(index / columns) * 220,
      },
    }));
  }
}
