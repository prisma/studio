import dayjs from "dayjs";
import {
  ArrowRight,
  FileDiff,
  GitBranch,
  Key,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { type FC, memo, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  Handle,
  type NodeProps,
  type NodeTypes,
  Position,
  type ReactFlowInstance,
} from "reactflow";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { Switch } from "../../../components/ui/switch";
import {
  type StudioMigration,
  useMigrations,
} from "../../../hooks/use-migrations";
import { useNavigation } from "../../../hooks/use-navigation";
import { useUiState } from "../../../hooks/use-ui-state";
import { cn } from "../../../lib/utils";
import { StudioHeader } from "../../StudioHeader";
import type { ViewProps } from "../View";
import {
  diffContracts,
  type DiffStatus,
  type FieldDiff,
  parseContractSnapshot,
  summarizeDiff,
} from "./contract-diff";
import {
  buildDiffGraph,
  type EnumDiffNodeData,
  layoutMigrationDiffNodes,
  type MigrationDiffNode,
  type ModelDiffNodeData,
} from "./diff-layout";
import {
  diffSchemas,
  renderPslSchema,
  schemaDiffHasChanges,
  type SchemaDiffLine,
} from "./psl-schema";

const STATUS_STYLES: Record<
  DiffStatus,
  {
    card: string;
    header: string;
    badge: string;
    badgeLabel: string;
    tape: string;
  }
> = {
  added: {
    card: "border-emerald-400/80 bg-emerald-50 dark:border-emerald-600/70 dark:bg-emerald-950/60",
    header: "text-emerald-900 dark:text-emerald-100",
    badge:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    badgeLabel: "new",
    tape: "bg-emerald-300/70 dark:bg-emerald-700/70",
  },
  removed: {
    card: "border-rose-400/80 bg-rose-50 dark:border-rose-600/70 dark:bg-rose-950/60",
    header: "text-rose-900 line-through decoration-2 dark:text-rose-100",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    badgeLabel: "removed",
    tape: "bg-rose-300/70 dark:bg-rose-700/70",
  },
  changed: {
    card: "border-amber-400/80 bg-amber-50 dark:border-amber-600/70 dark:bg-amber-950/50",
    header: "text-amber-900 dark:text-amber-100",
    badge:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    badgeLabel: "updated",
    tape: "bg-amber-300/70 dark:bg-amber-700/70",
  },
  unchanged: {
    card: "border-border bg-card opacity-70",
    header: "text-foreground",
    badge: "bg-muted text-muted-foreground border-border",
    badgeLabel: "unchanged",
    tape: "bg-muted-foreground/20",
  },
};

const FIELD_STATUS_GLYPHS: Record<
  DiffStatus,
  { glyph: string; className: string }
> = {
  added: {
    glyph: "+",
    className:
      "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold",
  },
  removed: {
    glyph: "−",
    className: "bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold",
  },
  changed: {
    glyph: "~",
    className: "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold",
  },
  unchanged: {
    glyph: "·",
    className: "text-muted-foreground/60",
  },
};

/** Deterministic sticky-note tilt so the canvas feels hand-placed. */
function cardRotation(seed: string): number {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  const tilts = [-1.4, -0.7, 0, 0.7, 1.4];

  return tilts[Math.abs(hash) % tilts.length] ?? 0;
}

function shortHash(hash: string | null): string {
  if (!hash) {
    return "∅";
  }

  return hash.replace(/^sha256:/, "").slice(0, 7);
}

const FieldRow: FC<{ field: FieldDiff }> = ({ field }) => {
  const glyph = FIELD_STATUS_GLYPHS[field.status];

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs",
          field.status === "removed" && "line-through opacity-70",
        )}
      >
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] leading-none",
            glyph.className,
          )}
        >
          {glyph.glyph}
        </span>
        {field.field.isPrimaryKey && (
          <Key className="size-3 shrink-0 text-primary" />
        )}
        <span className="min-w-0 truncate font-medium text-foreground">
          {field.name}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          {field.field.type}
          {field.field.nullable ? "?" : ""}
        </span>
      </div>
      {field.details.map((detail) => (
        <div
          key={detail.aspect}
          className="ml-6 flex items-center gap-1 pb-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
        >
          <span className="rounded bg-rose-500/10 px-1 text-rose-700 line-through dark:text-rose-300">
            {detail.before}
          </span>
          <ArrowRight className="size-2.5 shrink-0" />
          <span className="rounded bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-300">
            {detail.after}
          </span>
        </div>
      ))}
    </div>
  );
};

const ModelDiffNodeComponent: FC<NodeProps<ModelDiffNodeData>> = memo(
  ({ data }) => {
    const { model } = data;
    const styles = STATUS_STYLES[model.status];
    const rotation = cardRotation(model.name);
    const structureChips = [
      ...model.addedIndexes.map((index) => ({
        key: `+${index}`,
        label: `+ ${index}`,
        className:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      })),
      ...model.removedIndexes.map((index) => ({
        key: `-${index}`,
        label: `− ${index}`,
        className:
          "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 line-through",
      })),
    ];

    return (
      <div
        className={cn(
          "relative w-[264px] rounded-xl border-2 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.35)]",
          styles.card,
        )}
        data-testid={`migration-model-node-${model.name}`}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <div
          className={cn(
            "absolute -top-2.5 left-1/2 h-4 w-14 -translate-x-1/2 -rotate-2 rounded-sm opacity-90",
            styles.tape,
          )}
        />
        <div className="flex items-center justify-between gap-2 border-b border-current/10 px-3 pb-2 pt-3">
          <div className="min-w-0">
            <div className={cn("truncate text-sm font-bold", styles.header)}>
              {model.name}
            </div>
            {model.table && model.table !== model.name && (
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {model.table}
              </div>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              styles.badge,
            )}
          >
            {styles.badgeLabel}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
          {model.fields.map((field) => (
            <FieldRow key={field.name} field={field} />
          ))}
        </div>
        {structureChips.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-current/10 px-2 py-1.5">
            {structureChips.map((chip) => (
              <span
                key={chip.key}
                className={cn(
                  "rounded-full border px-1.5 py-px font-mono text-[9px]",
                  chip.className,
                )}
              >
                {chip.label}
              </span>
            ))}
          </div>
        )}
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0 }}
        />
      </div>
    );
  },
);

ModelDiffNodeComponent.displayName = "ModelDiffNodeComponent";

const EnumDiffNodeComponent: FC<NodeProps<EnumDiffNodeData>> = memo(
  ({ data }) => {
    const { enumDiff } = data;
    const rotation = cardRotation(enumDiff.name);
    const cardStatus =
      enumDiff.status === "unchanged" ? "unchanged" : enumDiff.status;

    return (
      <div
        className={cn(
          "relative w-[190px] rounded-xl border-2 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.35)]",
          cardStatus === "added" &&
            "border-violet-400/80 bg-violet-50 dark:border-violet-600/70 dark:bg-violet-950/60",
          cardStatus === "removed" &&
            "border-rose-400/80 bg-rose-50 dark:border-rose-600/70 dark:bg-rose-950/60",
          cardStatus === "changed" &&
            "border-violet-400/80 bg-violet-50 dark:border-violet-600/70 dark:bg-violet-950/60",
          cardStatus === "unchanged" && "border-border bg-card opacity-70",
        )}
        data-testid={`migration-enum-node-${enumDiff.name}`}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <div
          className={cn(
            "absolute -top-2.5 left-1/2 h-4 w-12 -translate-x-1/2 rotate-2 rounded-sm opacity-90",
            "bg-violet-300/70 dark:bg-violet-700/70",
          )}
        />
        <div className="flex items-center justify-between gap-2 border-b border-current/10 px-3 pb-2 pt-3">
          <span
            className={cn(
              "truncate text-sm font-bold text-violet-900 dark:text-violet-100",
              enumDiff.status === "removed" &&
                "text-rose-900 line-through dark:text-rose-100",
            )}
          >
            {enumDiff.name}
          </span>
          <span className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
            enum
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-2 py-1.5">
          {enumDiff.members.map((member) => {
            const glyph = FIELD_STATUS_GLYPHS[member.status];

            return (
              <div
                key={member.name}
                className={cn(
                  "flex items-center gap-1.5 px-1 text-xs",
                  member.status === "removed" && "line-through opacity-70",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[10px] leading-none",
                    glyph.className,
                  )}
                >
                  {glyph.glyph}
                </span>
                <span className="font-mono text-foreground">{member.name}</span>
              </div>
            );
          })}
        </div>
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0 }}
        />
      </div>
    );
  },
);

EnumDiffNodeComponent.displayName = "EnumDiffNodeComponent";

const nodeTypes: NodeTypes = {
  modelDiff: ModelDiffNodeComponent,
  enumDiff: EnumDiffNodeComponent,
};

function MigrationDiffCanvas(props: {
  migration: StudioMigration;
  showAllModels: boolean;
}) {
  const { migration, showAllModels } = props;
  const diff = useMemo(
    () => diffContracts(migration.contractBefore, migration.contractAfter),
    [migration.contractBefore, migration.contractAfter],
  );
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

  if (migration.contractAfter == null && migration.contractBefore == null) {
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
}

function MigrationListItem(props: {
  index: number;
  isSelected: boolean;
  migration: StudioMigration;
  onSelect: () => void;
}) {
  const { index, isSelected, migration, onSelect } = props;
  const stats = useMemo(
    () =>
      summarizeDiff(
        diffContracts(migration.contractBefore, migration.contractAfter).stats,
      ),
    [migration.contractBefore, migration.contractAfter],
  );

  return (
    <button
      className={cn(
        "group flex w-full flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left transition-colors",
        "hover:bg-accent/60",
        isSelected && "border-border bg-accent shadow-sm",
      )}
      data-testid={`migration-list-item-${migration.id}`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-5 min-w-7 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          #{index}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize text-foreground">
          {migration.displayName}
        </span>
        {migration.isDestructive && (
          <TriangleAlert className="size-3.5 shrink-0 text-amber-500" />
        )}
      </div>
      <div className="flex items-center gap-2 pl-9">
        <span className="text-[10px] text-muted-foreground">
          {migration.appliedAt
            ? dayjs(migration.appliedAt).format("MMM D, HH:mm:ss")
            : "unknown time"}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {migration.operations.length} op
          {migration.operations.length === 1 ? "" : "s"}
        </span>
      </div>
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-9">
          {stats.slice(0, 3).map((chip) => (
            <span
              key={chip}
              className={cn(
                "rounded-full px-1.5 py-px font-mono text-[9px]",
                chip.startsWith("+") &&
                  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                chip.startsWith("−") &&
                  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                chip.startsWith("~") &&
                  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function MigrationSqlPanel(props: { migration: StudioMigration }) {
  const { migration } = props;

  return (
    <div
      className="max-h-64 shrink-0 overflow-y-auto border-t border-border bg-card/80 px-4 py-3"
      data-testid="migration-sql-panel"
    >
      <div className="flex flex-col gap-3">
        {migration.operations.map((operation) => (
          <div key={operation.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  operation.operationClass === "destructive"
                    ? "destructive"
                    : "secondary"
                }
                className="text-[10px]"
              >
                {operation.operationClass}
              </Badge>
              <span className="text-xs font-medium text-foreground">
                {operation.label}
              </span>
            </div>
            {operation.statements.map((statement, index) => (
              <pre
                key={index}
                className="overflow-x-auto rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-foreground"
              >
                {statement}
              </pre>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const SCHEMA_DIFF_LINE_STYLES: Record<
  SchemaDiffLine["kind"],
  { row: string; gutter: string; symbol: string }
> = {
  added: {
    row: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    gutter: "text-emerald-600 dark:text-emerald-400",
    symbol: "+",
  },
  removed: {
    row: "bg-rose-500/10 text-rose-800 dark:text-rose-200",
    gutter: "text-rose-600 dark:text-rose-400",
    symbol: "−",
  },
  context: {
    row: "text-muted-foreground",
    gutter: "text-transparent",
    symbol: " ",
  },
  collapsed: {
    row: "text-muted-foreground/60 italic",
    gutter: "text-transparent",
    symbol: " ",
  },
};

function MigrationSchemaPanel(props: { migration: StudioMigration }) {
  const { migration } = props;
  const lines = useMemo(
    () =>
      diffSchemas(
        renderPslSchema(parseContractSnapshot(migration.contractBefore)),
        renderPslSchema(parseContractSnapshot(migration.contractAfter)),
      ),
    [migration.contractBefore, migration.contractAfter],
  );

  return (
    <div
      className="max-h-64 shrink-0 overflow-y-auto border-t border-border bg-card/80 px-4 py-3"
      data-testid="migration-schema-panel"
    >
      {schemaDiffHasChanges(lines) ? (
        <div className="overflow-hidden rounded-md border border-border/70 bg-muted/30">
          {lines.map((line, index) =>
            line.kind === "collapsed" ? (
              <div
                key={index}
                className={cn(
                  "px-3 py-1 text-center font-mono text-[10px]",
                  SCHEMA_DIFF_LINE_STYLES.collapsed.row,
                )}
              >
                ⋯ {line.hiddenCount} unchanged line
                {line.hiddenCount === 1 ? "" : "s"}
              </div>
            ) : (
              <div
                key={index}
                className={cn(
                  "flex gap-2 px-3 font-mono text-[11px] leading-relaxed",
                  SCHEMA_DIFF_LINE_STYLES[line.kind].row,
                )}
              >
                <span
                  className={cn(
                    "w-3 shrink-0 select-none text-center",
                    SCHEMA_DIFF_LINE_STYLES[line.kind].gutter,
                  )}
                >
                  {SCHEMA_DIFF_LINE_STYLES[line.kind].symbol}
                </span>
                <span className="whitespace-pre">{line.text}</span>
              </div>
            ),
          )}
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-muted-foreground">
          No schema-level changes in this migration.
        </div>
      )}
    </div>
  );
}

type MigrationDetailsPanelMode = "sql" | "schema" | null;

export function MigrationsView(_props: ViewProps) {
  const { hasPrismaNextMigrations, isLoading, isError, migrations } =
    useMigrations();
  const { migrationParam, setMigrationParam } = useNavigation();
  const [detailsPanel, setDetailsPanel] =
    useState<MigrationDetailsPanelMode>(null);
  const [showAllModels, setShowAllModels] = useUiState<boolean>(
    "migrations:show-all-models",
    false,
  );

  const selectedMigration = useMemo(() => {
    if (migrationParam) {
      const match = migrations.find(
        (migration) => String(migration.id) === migrationParam,
      );

      if (match) {
        return match;
      }
    }

    return migrations[0] ?? null;
  }, [migrationParam, migrations]);

  const selectedStats = useMemo(
    () =>
      selectedMigration
        ? summarizeDiff(
            diffContracts(
              selectedMigration.contractBefore,
              selectedMigration.contractAfter,
            ).stats,
          )
        : [],
    [selectedMigration],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <StudioHeader>
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Migrations</span>
          {migrations.length > 0 && (
            <Badge variant="secondary">{migrations.length}</Badge>
          )}
        </div>
      </StudioHeader>

      {!hasPrismaNextMigrations ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No Prisma Next migration ledger detected in this database.
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 gap-4 p-4">
          <div className="flex w-72 flex-col gap-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
          <Skeleton className="h-full flex-1" />
        </div>
      ) : isError ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Failed to load the migration ledger. Check the database connection and
          retry.
        </div>
      ) : migrations.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          The migration ledger is empty — apply a migration with prisma-next to
          see it here.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside
            className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-card/40 p-2"
            data-testid="migration-list"
          >
            {migrations.map((migration, position) => (
              <MigrationListItem
                key={migration.id}
                index={migrations.length - position}
                isSelected={selectedMigration?.id === migration.id}
                migration={migration}
                onSelect={() => {
                  void setMigrationParam(String(migration.id));
                }}
              />
            ))}
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            {selectedMigration && (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card/60 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <h1
                      className="truncate text-base font-semibold capitalize text-foreground"
                      data-testid="migration-title"
                    >
                      {selectedMigration.displayName}
                    </h1>
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      <span>{shortHash(selectedMigration.fromHash)}</span>
                      <ArrowRight className="size-3" />
                      <span>{shortHash(selectedMigration.toHash)}</span>
                      {selectedMigration.appliedAt && (
                        <span className="pl-2 font-sans">
                          applied{" "}
                          {dayjs(selectedMigration.appliedAt).format(
                            "MMM D, YYYY HH:mm:ss",
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {selectedStats.map((chip) => (
                      <span
                        key={chip}
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-[10px] font-medium",
                          chip.startsWith("+") &&
                            "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                          chip.startsWith("−") &&
                            "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                          chip.startsWith("~") &&
                            "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                        )}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        aria-label="Show all models"
                        checked={showAllModels}
                        data-testid="migration-show-all-models"
                        id="migration-show-all-models-switch"
                        onCheckedChange={(checked) =>
                          setShowAllModels(checked === true)
                        }
                      />
                      <label
                        className="cursor-pointer text-[11px] font-medium text-muted-foreground"
                        htmlFor="migration-show-all-models-switch"
                      >
                        All models
                      </label>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        className="h-7 shadow-none"
                        data-active={detailsPanel === "sql"}
                        data-testid="migration-panel-sql"
                        onClick={() =>
                          setDetailsPanel((panel) =>
                            panel === "sql" ? null : "sql",
                          )
                        }
                        size="xs"
                        type="button"
                        variant={
                          detailsPanel === "sql" ? "secondary" : "outline"
                        }
                      >
                        <Terminal data-icon="inline-start" />
                        SQL
                      </Button>
                      <Button
                        className="h-7 shadow-none"
                        data-active={detailsPanel === "schema"}
                        data-testid="migration-panel-schema"
                        onClick={() =>
                          setDetailsPanel((panel) =>
                            panel === "schema" ? null : "schema",
                          )
                        }
                        size="xs"
                        type="button"
                        variant={
                          detailsPanel === "schema" ? "secondary" : "outline"
                        }
                      >
                        <FileDiff data-icon="inline-start" />
                        Schema
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="relative min-h-0 flex-1">
                  <div className="absolute inset-0">
                    <MigrationDiffCanvas
                      migration={selectedMigration}
                      showAllModels={showAllModels}
                    />
                  </div>
                </div>

                {detailsPanel === "sql" && (
                  <MigrationSqlPanel migration={selectedMigration} />
                )}
                {detailsPanel === "schema" && (
                  <MigrationSchemaPanel migration={selectedMigration} />
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
