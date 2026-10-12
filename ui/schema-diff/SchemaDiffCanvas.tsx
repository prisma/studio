import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type ReactFlowInstance,
} from "reactflow";

import { diffContracts } from "./contract-diff";
import {
  buildDiffGraph,
  layoutMigrationDiffNodes,
  type MigrationDiffNode,
} from "./diff-layout";
import { nodeTypes } from "./SchemaDiffNodes";

// Keep the canvas mounted so shared nodes animate between snapshots.
export const SchemaDiffCanvas = memo(function SchemaDiffCanvas(props: {
  before: unknown;
  after: unknown;
  showAllModels: boolean;
}) {
  const { before, after, showAllModels } = props;
  const diff = useMemo(() => diffContracts(before, after), [before, after]);
  const graph = useMemo(
    () => buildDiffGraph(diff, showAllModels),
    [diff, showAllModels],
  );
  const [layoutedGraph, setLayoutedGraph] = useState<{
    nodes: MigrationDiffNode[];
    edges: Edge[];
  }>({ nodes: [], edges: [] });
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  useEffect(() => {
    let cancelled = false;

    void layoutMigrationDiffNodes(graph.nodes, graph.edges).then((nodes) => {
      if (cancelled) {
        return;
      }

      // Nodes and edges swap together so the morph transition animates
      // shared nodes (stable `model:<name>` ids) to their new positions
      // instead of tearing the whole canvas down.
      setLayoutedGraph({ nodes, edges: graph.edges });

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            void reactFlowInstanceRef.current?.fitView({
              duration: 500,
              padding: 0.18,
            });
          });
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [graph]);

  if (after == null && before == null) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        This migration was applied before contract snapshots were recorded, so
        there is no visual diff to show.
      </div>
    );
  }

  return (
    <ReactFlow
      className="migrations-diff-canvas"
      edges={layoutedGraph.edges}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      maxZoom={1.4}
      minZoom={0.2}
      nodes={layoutedGraph.nodes}
      nodesConnectable={false}
      nodesDraggable={false}
      nodeTypes={nodeTypes}
      onInit={(instance) => {
        reactFlowInstanceRef.current = instance;
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background className="bg-muted/40" gap={20} size={1.5} />
      <Controls
        className="shadow-sm [&_button]:border [&_button]:border-input [&_button]:bg-background [&_button_>_svg]:fill-foreground"
        showInteractive={false}
      />
    </ReactFlow>
  );
});
