import { AlertCircle, Key, SquareArrowRight } from "lucide-react";
import { type FC, JSX, memo, useCallback, useEffect, useMemo } from "react";
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  ConnectionLineType,
  Controls,
  type Edge,
  type EdgeChange,
  // EdgeMarker, // TODO: Add EdgeMarkers for relationship type
  Handle,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  Position,
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
import { cn } from "../../../lib/utils";

type Field = {
  name: string;
  type: string;
  isPrimary?: boolean;
  isRequired?: boolean;
  isNullable?: boolean;
  isForeignKey?: boolean;
  foreignKeyTo?: { table: string; column: string };
};

type Table = {
  name: string;
  fields: Field[];
};

type SchemaVisualizationProps = {
  tables: Table[];
  relationships: { from: string; to: string; type: string }[];
};

interface TableNodeData {
  label: string;
  fields: Field[];
}

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

const TableNode: FC<NodeProps<TableNodeData>> = memo(({ data }) => {
  const {
    metadata: { activeSchema },
    createUrl,
  } = useNavigation();
  const isNoTablesNode = data.label === "No Tables Found";

  // This function now returns an array of icon components to render for a field
  const getFieldIcons = (field: Field): JSX.Element[] => {
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
          "min-w-[250px] shadow-xl rounded-md border border-border bg-card",
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

/**
 * Create a layout for the nodes with tables placed in a grid formation
 * with related tables placed closer to each other.
 */
function getLayoutedNodes(
  tables: Table[],
  _relationships: { from: string; to: string; type: string }[],
): Node[] {
  // If there are only a few tables, use a simple horizontal layout
  if (tables.length <= 3) {
    return tables.map((table, index) => ({
      id: table.name,
      type: "tableNode",
      data: {
        label: table.name,
        fields: table.fields,
      },
      position: { x: 350 * index, y: 50 },
    }));
  }

  // For more tables, use a grid layout
  const GRID_GAP_X = 350;
  const GRID_GAP_Y = 300;
  const COLUMNS = Math.ceil(Math.sqrt(tables.length));

  return tables.map((table, index) => {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);

    return {
      id: table.name,
      type: "tableNode",
      data: {
        label: table.name,
        fields: table.fields,
      },
      position: {
        x: column * GRID_GAP_X,
        y: row * GRID_GAP_Y,
      },
    };
  });
}

export function SchemaVisualization({
  tables,
  relationships,
}: SchemaVisualizationProps) {
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

  // Create an organized layout for nodes
  const initialNodes = useMemo(
    () => getLayoutedNodes(tables, validRelationships),
    [tables, validRelationships],
  );

  // Create edges with appropriate styling
  const initialEdges: Edge[] = useMemo(
    () =>
      validRelationships.map((rel, index) => ({
        id: `e${index}`,
        source: rel.from,
        target: rel.to,
        animated: true,
        label: rel.type,
        type: "smoothstep",
        style: {
          stroke: "var(--primary)",
          strokeWidth: 1,
          strokeDasharray: "5 5",
        },
        labelStyle: {
          fill: "var(--primary)",
          fontSize: 12,
        },
      })),
    [validRelationships],
  );

  const stateScope = useMemo(
    () =>
      tables
        .map((table) => table.name)
        .sort()
        .join("|") || "__empty__",
    [tables],
  );

  const [nodes, setNodes] = useUiState<Node[]>(
    `schema-visualizer:${stateScope}:nodes`,
    initialNodes,
    { cleanupOnUnmount: true },
  );
  const [edges, setEdges] = useUiState<Edge[]>(
    `schema-visualizer:${stateScope}:edges`,
    initialEdges,
    { cleanupOnUnmount: true },
  );

  // Update nodes when tables change
  useEffect(() => {
    setNodes(getLayoutedNodes(tables, validRelationships));
  }, [tables, validRelationships, setNodes]);

  // Update edges when relationships change
  useEffect(() => {
    setEdges(
      validRelationships.map((rel, index) => ({
        id: `e${index}`,
        source: rel.from,
        target: rel.to,
        animated: true,
        label: rel.type,
        type: "smoothstep",
        style: {
          stroke: "var(--primary)",
          strokeWidth: 1,
          strokeDasharray: "5 5",
        },
        labelStyle: {
          fontSize: 12,
        },
      })),
    );
  }, [validRelationships, setEdges]);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes)),
    [setNodes],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges)),
    [setEdges],
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
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectionLineType={ConnectionLineType.SmoothStep}
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
