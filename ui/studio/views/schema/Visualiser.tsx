import { AlertCircle, Key, SquareArrowRight } from "lucide-react";
import {
  type FC,
  JSX,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import ReactFlow, {
  Background,
  ConnectionLineType,
  Controls,
  type Edge,
  // EdgeMarker, // TODO: Add EdgeMarkers for relationship type
  Handle,
  MiniMap,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  Position,
  type ReactFlowInstance,
} from "reactflow";

import { Button } from "@/ui/components/ui/button";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useUiState } from "@/ui/hooks/use-ui-state";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import type {
  Relationship,
  Table,
} from "../../../hooks/use-schema-visualization";
import { cn } from "../../../lib/utils";
import {
  applySchemaNodePositions,
  createFallbackLayoutedSchemaNodes,
  createSchemaEdges,
  createSchemaLayoutSignature,
  createSchemaNodePositions,
  createSchemaVisualizerStateScope,
  createSchemaVisualizerUiStateKey,
  getAutoLayoutedSchemaNodes,
  hasSchemaNodePositionsForAllNodes,
  type SchemaNodeData,
  type SchemaNodePositions,
} from "./schema-layout";

type SchemaVisualizationProps = {
  tables: Table[];
  relationships: Relationship[];
};

// Helper component for rendering an icon with a tooltip
const IconWithTooltip: FC<{
  iconElement: JSX.Element;
  tooltipText: string;
  className?: string;
}> = ({ iconElement, tooltipText, className }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className={className}>{iconElement}</span>
    </TooltipTrigger>
    <TooltipContent>{tooltipText}</TooltipContent>
  </Tooltip>
);

const TableNode: FC<NodeProps<SchemaNodeData>> = memo(({ data }) => {
  const {
    metadata: { activeSchema },
    createUrl,
  } = useNavigation();
  const isNoTablesNode = data.label === "No Tables Found";

  // This function now returns an array of icon components to render for a field
  const getFieldIcons = (
    field: SchemaNodeData["fields"][number],
  ): JSX.Element[] => {
    const icons: JSX.Element[] = [];

    // Special case for the "No Tables Found" node message
    if (isNoTablesNode && field.type === "info") {
      icons.push(
        <IconWithTooltip
          key="info"
          iconElement={<AlertCircle size={16} />}
          tooltipText="Informational message"
        />,
      );
      return icons;
    }

    // Icon for Primary Key
    if (field.isPrimary) {
      icons.push(
        <IconWithTooltip
          key="pk"
          iconElement={<Key className="size-3 text-primary" />}
          tooltipText="Primary Key"
          className="flex size-5 items-center justify-center rounded-full bg-muted p-0.5 text-muted-foreground"
        />,
      );
    } else if (field.isNullable) {
      // Icon for Nullable (only if not a Primary Key, as PKs usually aren't nullable)
      icons.push(
        <IconWithTooltip
          key="nullable"
          iconElement={
            <span className="inline-flex size-4 items-center justify-center text-center text-muted-foreground">
              ?
            </span>
          }
          tooltipText="Nullable"
          className="flex size-5 items-center justify-center rounded-full bg-muted p-0.5 text-muted-foreground"
        />,
      );
    }

    // Additional Icon for Foreign Key
    if (field.isForeignKey) {
      const fkTooltip = field.foreignKeyTo
        ? `Foreign Key to ${field.foreignKeyTo.table}.${field.foreignKeyTo.column}`
        : "Foreign Key";
      icons.push(
        <IconWithTooltip
          key="fk"
          iconElement={<Key className="size-3" />}
          tooltipText={fkTooltip}
          className="flex size-5 items-center justify-center rounded-full bg-primary p-0.5 text-primary-foreground"
        />,
      );
    }
    return icons;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "min-w-[280px] shadow-xl rounded-md border border-border bg-card",
          isNoTablesNode && "border-orange-400",
        )}
      >
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div
          className={cn(
            "px-4 py-3 border-b border-border flex justify-between items-center text-foreground",
            isNoTablesNode &&
              "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300",
          )}
        >
          <div className="font-semibold">{data.label}</div>
          {!isNoTablesNode && (
            <Button asChild variant="ghost" size="icon" className="size-7">
              <a
                aria-label={`Open table ${data.label}`}
                href={createUrl({
                  tableParam: data.label,
                  schemaParam: activeSchema?.name,
                  viewParam: "table",
                })}
                rel="noopener noreferrer"
                title={`Open table ${data.label}`}
                onClick={(e) => e.stopPropagation()}
              >
                <SquareArrowRight data-icon="inline-start" />
              </a>
            </Button>
          )}
        </div>
        <div className="px-4 py-2">
          {isNoTablesNode ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              {getFieldIcons({
                name: "message",
                type: "info",
                isNullable: false,
                isPrimary: false,
                isForeignKey: false,
              }).map((icon, idx) => (
                <div key={idx}>{icon}</div>
              ))}
              <span className="flex-1">
                No database tables found. Connect to a database to see your
                schema.
              </span>
            </div>
          ) : (
            data.fields.map((field, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-2 py-2 text-sm text-foreground",
                  field.isPrimary && "text-primary",
                )}
              >
                {/* Container for icons, allows multiple icons side-by-side */}
                <div className="flex items-center gap-1 min-w-[calc(1.25rem*2+0.25rem)]">
                  {getFieldIcons(field).map((iconComponent, idx) => (
                    <div key={idx}>{iconComponent}</div>
                  ))}
                </div>
                <span className="flex-1 truncate max-w-44">{field.name}</span>
                <span className="text-xs text-muted-foreground font-mono truncate">
                  {field.type}
                </span>
              </div>
            ))
          )}
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ opacity: 0 }}
        />
      </div>
    </TooltipProvider>
  );
});

TableNode.displayName = "TableNode";

const nodeTypes = {
  tableNode: TableNode,
} as NodeTypes;

export function SchemaVisualization({
  tables,
  relationships,
}: SchemaVisualizationProps) {
  const {
    metadata: { activeSchema },
  } = useNavigation();
  const nodePositionsRef = useRef<SchemaNodePositions>({});
  const reactFlowInstanceRef = useRef<ReactFlowInstance<SchemaNodeData> | null>(
    null,
  );
  // Create a map of node IDs for quick lookup
  const nodeIdSet = useMemo(
    () => new Set(tables.map((table) => table.name)),
    [tables],
  );

  // Filter out relationships where either source or target doesn't exist
  const validRelationships = useMemo(
    () =>
      relationships.filter(
        (rel) => nodeIdSet.has(rel.from) && nodeIdSet.has(rel.to),
      ),
    [relationships, nodeIdSet],
  );

  const baseNodes = useMemo(
    () => createFallbackLayoutedSchemaNodes(tables),
    [tables],
  );
  const initialEdges: Edge[] = useMemo(
    () => createSchemaEdges(validRelationships),
    [validRelationships],
  );

  const stateScope = useMemo(
    () => createSchemaVisualizerStateScope(activeSchema?.name, tables),
    [activeSchema?.name, tables],
  );
  const layoutSignature = useMemo(
    () => createSchemaLayoutSignature(baseNodes, initialEdges),
    [baseNodes, initialEdges],
  );
  const [nodePositions, setNodePositions] = useUiState<SchemaNodePositions>(
    createSchemaVisualizerUiStateKey(stateScope, "node-positions"),
    {},
  );
  const [_autoLayoutPositions, setAutoLayoutPositions] =
    useUiState<SchemaNodePositions>(
      createSchemaVisualizerUiStateKey(
        stateScope,
        "auto-layout-node-positions",
      ),
      {},
    );
  const [hasAutoLayout, setHasAutoLayout] = useUiState<boolean>(
    createSchemaVisualizerUiStateKey(stateScope, "has-auto-layout"),
    false,
  );
  const [appliedLayoutSignature, setAppliedLayoutSignature] =
    useUiState<string>(
      createSchemaVisualizerUiStateKey(stateScope, "layout-signature"),
      "",
    );
  const [resetLayoutVersion] = useUiState<number>(
    createSchemaVisualizerUiStateKey(stateScope, "reset-layout-version"),
    0,
  );
  const nodes = useMemo(
    () => applySchemaNodePositions(baseNodes, nodePositions),
    [baseNodes, nodePositions],
  );
  const previousResetLayoutVersionRef = useRef(resetLayoutVersion);

  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  const scheduleFitView = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void reactFlowInstanceRef.current?.fitView({ padding: 0.2 });
      });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncNodes() {
      if (
        hasAutoLayout &&
        appliedLayoutSignature === layoutSignature &&
        hasSchemaNodePositionsForAllNodes(baseNodes, nodePositions)
      ) {
        return;
      }

      try {
        const layoutedNodes = await getAutoLayoutedSchemaNodes(
          baseNodes,
          initialEdges,
        );

        if (cancelled) {
          return;
        }

        const nextAutoLayoutPositions =
          createSchemaNodePositions(layoutedNodes);

        setAutoLayoutPositions(nextAutoLayoutPositions);
        setNodePositions(nextAutoLayoutPositions);
      } catch {
        if (cancelled) {
          return;
        }

        const fallbackPositions = createSchemaNodePositions(baseNodes);

        setAutoLayoutPositions(fallbackPositions);
        setNodePositions(fallbackPositions);
      }

      setHasAutoLayout(true);
      setAppliedLayoutSignature(layoutSignature);
      scheduleFitView();
    }

    void syncNodes();

    return () => {
      cancelled = true;
    };
  }, [
    appliedLayoutSignature,
    baseNodes,
    hasAutoLayout,
    initialEdges,
    layoutSignature,
    nodePositions,
    scheduleFitView,
    setAutoLayoutPositions,
    setAppliedLayoutSignature,
    setHasAutoLayout,
    setNodePositions,
  ]);

  useEffect(() => {
    if (previousResetLayoutVersionRef.current === resetLayoutVersion) {
      return;
    }

    previousResetLayoutVersionRef.current = resetLayoutVersion;
    scheduleFitView();
  }, [resetLayoutVersion, scheduleFitView]);
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextPositions = Object.fromEntries(
        changes.flatMap((change) => {
          if (change.type !== "position" || !change.position) {
            return [];
          }

          return [
            [
              change.id,
              {
                x: change.position.x,
                y: change.position.y,
              },
            ] as const,
          ];
        }),
      );

      if (Object.keys(nextPositions).length === 0) {
        return;
      }

      setNodePositions({
        ...nodePositionsRef.current,
        ...nextPositions,
      });
    },
    [setNodePositions],
  );

  const controlStyles = cn(
    "shadow-sm",
    "[&_button]:border [&_button]:border-input [&_button]:bg-background [&_button]:shadow-sm hover:[&_button]:bg-accent hover:[&_button]:text-accent-foreground",
    "[&_button_>_svg]:fill-foreground",
  );

  const miniMapStyles = cn(
    "bg-muted/70 backdrop-blur-sm",
    "[&_svg_>_rect]:fill-muted-foreground/80",
    "[&_svg_>_path]:fill-background [&_svg_>_path]:opacity-50",
  );

  return (
    <>
      <div className="w-full h-full bg-card">
        <ReactFlow
          nodes={nodes}
          edges={initialEdges}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance;
          }}
          onNodesChange={onNodesChange}
          connectionLineType={ConnectionLineType.Step}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background className="bg-muted" gap={16} />
          <Controls showInteractive={false} className={controlStyles} />
          <MiniMap pannable className={miniMapStyles} />
        </ReactFlow>
      </div>
    </>
  );
}
