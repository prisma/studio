import ELK, { type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";

import type { TemporalTypeMap, TemporalTypeMapNode } from "@/data/temporal";

const elk = new ELK();

export interface TypeMapNodeSize {
  height: number;
  width: number;
}

export interface TypeMapPoint {
  x: number;
  y: number;
}

export interface TypeMapLayout {
  /** The route of each arrow around the nodes, and where its count goes. */
  edges: Record<string, { label?: TypeMapPoint; points: TypeMapPoint[] }>;
  nodes: Record<string, TypeMapPoint>;
}

/** The middle of the longest straight part of a route: where the arrow's count is easiest to read. */
function labelPoint(points: TypeMapPoint[]): TypeMapPoint | undefined {
  let longest: { length: number; point: TypeMapPoint } | undefined;

  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);

    if (!longest || length > longest.length) {
      longest = {
        length,
        point: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
      };
    }
  }

  return longest?.point;
}

/** Whether a step has a line of marks: failed, retried, or runs that are at it now. */
export function typeMapNodeHasMarks(node: TemporalTypeMapNode): boolean {
  return (
    node.failedRunCount > 0 ||
    node.retriedRunCount > 0 ||
    node.waitingRunCount > 0
  );
}

/** The size the diagram draws a node at; the layout needs it before the browser has measured anything. */
export function typeMapNodeSize(
  node: TemporalTypeMapNode,
  /** Whether the step has a third line. A diagram of one run gives every step one. */
  hasThirdLine = typeMapNodeHasMarks(node),
): TypeMapNodeSize {
  if (node.kind === "start") {
    return { height: 30, width: 80 };
  }

  if (node.kind === "end") {
    return { height: 34, width: 190 };
  }

  return { height: hasThirdLine ? 82 : 56, width: 240 };
}

/**
 * The nodes in an order in which a step comes after the steps that lead to
 * it. The layout draws an arrow that points back in this order as the arrow
 * that closes a loop, so only real loops may point back.
 *
 * Where a loop leaves no step with all its predecessors placed, the next step
 * is the one that runs reach first among those that follow a placed step.
 */
export function orderTypeMapNodes(
  map: Pick<TemporalTypeMap, "edges" | "nodes">,
): TemporalTypeMapNode[] {
  const steps = map.nodes.filter(
    (node) => node.kind !== "start" && node.kind !== "end",
  );
  const placed = new Set(
    map.nodes.filter((node) => node.kind === "start").map((node) => node.id),
  );
  const ordered: TemporalTypeMapNode[] = [];
  const predecessors = (id: string) =>
    map.edges.filter((edge) => edge.to === id).map((edge) => edge.from);

  while (ordered.length < steps.length) {
    const remaining = steps.filter((node) => !placed.has(node.id));
    const next =
      remaining.find((node) =>
        predecessors(node.id).every((from) => placed.has(from)),
      ) ??
      remaining.find((node) =>
        predecessors(node.id).some((from) => placed.has(from)),
      ) ??
      remaining[0]!;

    placed.add(next.id);
    ordered.push(next);
  }

  return [
    ...map.nodes.filter((node) => node.kind === "start"),
    ...ordered,
    ...map.nodes.filter((node) => node.kind === "end"),
  ];
}

/**
 * Places the nodes top to bottom: the start in the first row, the statuses that
 * runs close with in the last. An arrow that more runs took is kept straighter,
 * so the usual path reads as one column and the rare paths branch off it. The
 * arrows are routed around the nodes.
 */
export async function layoutTypeMap(
  map: Pick<TemporalTypeMap, "edges" | "nodes">,
  options: { allStepsTall?: boolean } = {},
): Promise<TypeMapLayout> {
  const nodes = orderTypeMapNodes(map);
  const indexOf = new Map(nodes.map((node, index) => [node.id, index]));
  const layout = await elk.layout({
    children: nodes.map((node) => ({
      ...typeMapNodeSize(node, options.allStepsTall ? true : undefined),
      id: node.id,
      ...(node.kind === "start" || node.kind === "end"
        ? {
            layoutOptions: {
              "elk.layered.layering.layerConstraint":
                node.kind === "start" ? "FIRST" : "LAST",
            },
          }
        : {}),
    })),
    edges: [...map.edges]
      .sort(
        (a, b) =>
          indexOf.get(a.from)! - indexOf.get(b.from)! ||
          b.runCount - a.runCount,
      )
      .map((edge) => ({
        id: edge.id,
        layoutOptions: {
          "elk.layered.priority.straightness": String(edge.runCount),
        },
        sources: [edge.from],
        targets: [edge.to],
      })),
    id: "type-map",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
      "elk.layered.spacing.edgeNodeBetweenLayers": "22",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      "elk.spacing.edgeEdge": "18",
      "elk.spacing.edgeNode": "28",
      "elk.spacing.nodeNode": "36",
    },
  });

  return {
    edges: Object.fromEntries(
      ((layout.edges ?? []) as ElkExtendedEdge[]).map((edge) => {
        const points = (edge.sections ?? []).flatMap((section) => [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ]);

        return [edge.id, { label: labelPoint(points), points }];
      }),
    ),
    nodes: Object.fromEntries(
      (layout.children ?? []).map((child) => [
        child.id,
        { x: child.x ?? 0, y: child.y ?? 0 },
      ]),
    ),
  };
}

/** An SVG path through the points with its corners rounded. */
export function roundedPath(points: TypeMapPoint[], radius: number): string {
  if (points.length === 0) {
    return "";
  }

  const [first, ...rest] = points;
  let path = `M ${first!.x} ${first!.y}`;

  rest.forEach((point, index) => {
    const next = rest[index + 1];
    const previous = index === 0 ? first! : rest[index - 1]!;

    if (!next) {
      path += ` L ${point.x} ${point.y}`;
      return;
    }

    const towards = (to: TypeMapPoint) => {
      const length = Math.hypot(to.x - point.x, to.y - point.y);
      const reach = Math.min(radius, length / 2);

      return length === 0
        ? point
        : {
            x: point.x + ((to.x - point.x) / length) * reach,
            y: point.y + ((to.y - point.y) / length) * reach,
          };
    };
    const before = towards(previous);
    const after = towards(next);

    path += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
  });

  return path;
}
