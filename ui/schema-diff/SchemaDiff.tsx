import dayjs from "dayjs";
import { ArrowRight, FileDiff, Terminal } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { StudioMigrationOperation } from "../../data/migrations";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { cn } from "../lib/utils";
import { diffContracts, summarizeDiff } from "./contract-diff";
import { SchemaDiffCanvas } from "./SchemaDiffCanvas";
import { SchemaDiffSchemaPanel, SchemaDiffSqlPanel } from "./SchemaDiffDetails";

const DETAILS_PANEL_DEFAULT_HEIGHT = 256;
const DETAILS_PANEL_MIN_HEIGHT = 120;
const DETAILS_PANEL_MAX_HEIGHT = 640;

function clampDetailsPanelHeight(height: number): number {
  return Math.min(
    DETAILS_PANEL_MAX_HEIGHT,
    Math.max(DETAILS_PANEL_MIN_HEIGHT, Math.round(height)),
  );
}

export interface SchemaDiffProps {
  className?: string;
  scoped?: boolean;
  mode?: "schema" | "diff";
  before: unknown;
  after: unknown;
  title?: string;
  fromLabel?: string;
  toLabel?: string;
  appliedAt?: Date | string | null;
  operations?: readonly StudioMigrationOperation[];
  defaultShowAllModels?: boolean;
  showAllModels?: boolean;
  onShowAllModelsChange?: (value: boolean) => void;
  detailsPanelHeight?: number;
  onDetailsPanelHeightChange?: (value: number) => void;
  missingSnapshotsMessage?: string;
}

/** Recorded contract comparison, independent of Studio navigation and providers. */
export function SchemaDiff({
  className,
  scoped = true,
  mode = "diff",
  before,
  after,
  title = "Database schema",
  fromLabel = "Before",
  toLabel = "After",
  appliedAt,
  operations,
  defaultShowAllModels = false,
  showAllModels: controlledShowAllModels,
  onShowAllModelsChange,
  detailsPanelHeight: controlledPanelHeight,
  onDetailsPanelHeightChange,
  missingSnapshotsMessage = "Contract snapshots are unavailable for this comparison.",
}: SchemaDiffProps) {
  const [detailsPanel, setDetailsPanel] = useState<"sql" | "schema" | null>(
    null,
  );
  const [localShowAllModels, setLocalShowAllModels] =
    useState(defaultShowAllModels);
  const showAllModels =
    mode === "schema" || (controlledShowAllModels ?? localShowAllModels);
  const setShowAllModels = onShowAllModelsChange ?? setLocalShowAllModels;
  const [localPanelHeight, setLocalPanelHeight] = useState(
    DETAILS_PANEL_DEFAULT_HEIGHT,
  );
  const detailsPanelHeight = controlledPanelHeight ?? localPanelHeight;
  const setDetailsPanelHeight =
    onDetailsPanelHeightChange ?? setLocalPanelHeight;
  const showAllModelsId = useId();
  const baseline = mode === "schema" ? after : before;
  const contractDataMissing = baseline == null && after == null;
  const selectedStats = useMemo(
    () => summarizeDiff(diffContracts(baseline, after).stats),
    [baseline, after],
  );
  const [draftPanelHeight, setDraftPanelHeight] = useState<number | null>(null);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const panelResizeStateRef = useRef<{
    startHeight: number;
    startY: number;
  } | null>(null);
  const resolvedPanelHeight = clampDetailsPanelHeight(
    draftPanelHeight ?? detailsPanelHeight,
  );

  useEffect(() => {
    if (!isPanelResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = panelResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      setDraftPanelHeight(
        clampDetailsPanelHeight(
          resizeState.startHeight + (resizeState.startY - event.clientY),
        ),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const resizeState = panelResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      const nextHeight = clampDetailsPanelHeight(
        resizeState.startHeight + (resizeState.startY - event.clientY),
      );

      panelResizeStateRef.current = null;
      setDraftPanelHeight(null);
      setIsPanelResizing(false);
      setDetailsPanelHeight(nextHeight);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isPanelResizing, setDetailsPanelHeight]);

  return (
    <div
      className={cn(scoped && "ps", className)}
      style={{ height: "100%", minHeight: 0, minWidth: 0 }}
    >
      <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background font-sans">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur-md [&>*]:pointer-events-auto">
          <h1
            className="max-w-64 truncate text-sm font-semibold capitalize text-foreground"
            data-testid="migration-title"
          >
            {title}
          </h1>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span>{fromLabel}</span>
            <ArrowRight className="size-3" />
            <span>{toLabel}</span>
            {appliedAt && (
              <span className="hidden pl-2 font-sans xl:inline">
                applied {dayjs(appliedAt).format("MMM D, YYYY HH:mm:ss")}
              </span>
            )}
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
            {!contractDataMissing && mode !== "schema" && (
              <div className="flex items-center gap-1.5">
                <Switch
                  aria-label="Show all models"
                  checked={showAllModels}
                  data-testid="migration-show-all-models"
                  id={showAllModelsId}
                  onCheckedChange={(checked) =>
                    setShowAllModels(checked === true)
                  }
                />
                <label
                  className="cursor-pointer text-[11px] font-medium text-muted-foreground"
                  htmlFor={showAllModelsId}
                >
                  All models
                </label>
              </div>
            )}
            <div className="flex items-center gap-1">
              {operations !== undefined && (
                <Button
                  aria-pressed={detailsPanel === "sql"}
                  className="h-7 shadow-none"
                  data-active={detailsPanel === "sql"}
                  data-testid="migration-panel-sql"
                  onClick={() =>
                    setDetailsPanel((panel) => (panel === "sql" ? null : "sql"))
                  }
                  size="xs"
                  type="button"
                  variant={detailsPanel === "sql" ? "secondary" : "outline"}
                >
                  <Terminal data-icon="inline-start" />
                  SQL
                </Button>
              )}
              {!contractDataMissing && (
                <Button
                  aria-pressed={detailsPanel === "schema"}
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
                  variant={detailsPanel === "schema" ? "secondary" : "outline"}
                >
                  <FileDiff data-icon="inline-start" />
                  Schema
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          {contractDataMissing ? (
            <div
              className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground"
              data-testid="migration-contract-upgrade-notice"
            >
              {missingSnapshotsMessage}
            </div>
          ) : (
            <div className="absolute inset-0">
              <SchemaDiffCanvas
                before={baseline}
                after={after}
                showAllModels={showAllModels}
              />
            </div>
          )}
        </div>

        {detailsPanel !== null && (
          <div
            className="relative shrink-0 border-t border-border bg-card/80"
            data-testid="migration-details-panel"
            style={{ height: `${resolvedPanelHeight}px` }}
          >
            <button
              aria-label="Resize details panel"
              className="group absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-row-resize touch-none items-center justify-center outline-none"
              data-testid="migration-panel-resize-handle"
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setDetailsPanelHeight(
                    clampDetailsPanelHeight(resolvedPanelHeight + 16),
                  );
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setDetailsPanelHeight(
                    clampDetailsPanelHeight(resolvedPanelHeight - 16),
                  );
                }
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }

                panelResizeStateRef.current = {
                  startHeight: resolvedPanelHeight,
                  startY: event.clientY,
                };
                setDraftPanelHeight(resolvedPanelHeight);
                setIsPanelResizing(true);
                event.preventDefault();
              }}
              type="button"
            >
              <span className="h-1 w-10 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/60 group-focus-visible:bg-muted-foreground/60" />
            </button>
            <div className="h-full overflow-y-auto px-4 py-3">
              {detailsPanel === "sql" ? (
                <SchemaDiffSqlPanel operations={operations ?? []} />
              ) : (
                <SchemaDiffSchemaPanel
                  mode={mode}
                  before={baseline}
                  after={after}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
