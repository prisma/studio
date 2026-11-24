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

interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** The room an arrow's text takes when the caller gives no width: a short share such as "↻ 100%". */
const LABEL_BOX = { height: 18, width: 58 };

function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function labelBox(point: TypeMapPoint, width = LABEL_BOX.width): Box {
  return {
    height: LABEL_BOX.height,
    width,
    x: point.x - width / 2,
    y: point.y - LABEL_BOX.height / 2,
  };
}

/**
 * Where an arrow's text goes: on the longest straight part of its route that
 * has room, clear of the steps and of the texts already placed. With no free
 * place it goes to the middle of the longest part.
 */
function labelPoint(
  points: TypeMapPoint[],
  taken: Box[],
  width?: number,
): TypeMapPoint | undefined {
  const segments = points
    .slice(1)
    .map((to, index) => {
      const from = points[index]!;

      return { from, length: Math.hypot(to.x - from.x, to.y - from.y), to };
    })
    .sort((a, b) => b.length - a.length);
  const candidates = segments.flatMap(({ from, to }) =>
    [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9].map((share) => ({
      x: from.x + (to.x - from.x) * share,
      y: from.y + (to.y - from.y) * share,
    })),
  );

  return (
    candidates.find(
      (point) =>
        !taken.some((box) => boxesOverlap(labelBox(point, width), box)),
    ) ?? candidates[0]
  );
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
    // "Continued as New" is the one status whose badge and run count need more room.
    return { height: 34, width: node.status === "ContinuedAsNew" ? 240 : 190 };
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
  options: {
    allStepsTall?: boolean;
    /** The width of each arrow's text, by arrow ID, so the texts are placed clear of each other. */
    labelWidths?: Record<string, number>;
  } = {},
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

  const sizeOf = new Map(
    nodes.map((node) => [
      node.id,
      typeMapNodeSize(node, options.allStepsTall ? true : undefined),
    ]),
  );
  // The steps, then each text as it is placed, so the texts keep clear of both.
  const taken: Box[] = (layout.children ?? []).map((child) => ({
    ...sizeOf.get(child.id)!,
    x: child.x ?? 0,
    y: child.y ?? 0,
  }));
  const runCountOf = new Map(map.edges.map((edge) => [edge.id, edge.runCount]));
  const routes = ((layout.edges ?? []) as ElkExtendedEdge[]).map((edge) => ({
    id: edge.id,
    points: (edge.sections ?? []).flatMap((section) => [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]),
  }));
  const labels = new Map<string, TypeMapPoint | undefined>();

  // The arrows most runs took choose their place first.
  for (const route of [...routes].sort(
    (a, b) => (runCountOf.get(b.id) ?? 0) - (runCountOf.get(a.id) ?? 0),
  )) {
    const width = options.labelWidths?.[route.id];
    const point = labelPoint(route.points, taken, width);

    labels.set(route.id, point);

    if (point) {
      taken.push(labelBox(point, width));
    }
  }

  return {
    edges: Object.fromEntries(
      routes.map((route) => [
        route.id,
        { label: labels.get(route.id), points: route.points },
      ]),
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
