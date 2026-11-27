import { ChevronDown, History, ListFilter, Loader2 } from "lucide-react";

import type { TemporalWorkflowStatus } from "@/data/temporal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
import { toggleVariants } from "@/ui/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { cn } from "@/ui/lib/utils";

import { WorkflowStatusIcon } from "./TemporalPrimitives";

const STATUS_PRESETS: Array<{
  label: string;
  status: TemporalWorkflowStatus | "All";
}> = [
  { label: "All", status: "All" },
  { label: "Running", status: "Running" },
  { label: "Paused", status: "Paused" },
  { label: "Failed", status: "Failed" },
  { label: "Timed Out", status: "TimedOut" },
  { label: "Completed", status: "Completed" },
  { label: "Continued as New", status: "ContinuedAsNew" },
  { label: "Canceled", status: "Canceled" },
  { label: "Terminated", status: "Terminated" },
];

const pillClass = "h-7 gap-1.5 px-2.5 text-xs font-normal";
const selectedPillClass = "bg-secondary font-medium";

/**
 * The preset a search is: "All" for no search, a status for a filter on that
 * status alone, and null for every other filter or text.
 */
export function statusPresetOfQuery(
  query: string,
): TemporalWorkflowStatus | "All" | null {
  const text = query.trim();

  if (text.length === 0) {
    return "All";
  }

  const status = /^ExecutionStatus\s*=\s*["']([A-Za-z]+)["']$/.exec(text)?.[1];

  return (
    STATUS_PRESETS.find((preset) => preset.status === status)?.status ?? null
  );
}

/**
 * The status presets of the Workflows grid, with the counts of the whole
 * namespace, so the row stays the same under every filter. A search that is
 * not a preset shows as one more selected item, which opens the recent filters.
 */
export function TemporalStatusFilterBar(props: {
  /** The counts of the whole namespace. Undefined while they load. */
  counts?: {
    countsByStatus: Partial<Record<TemporalWorkflowStatus, number>>;
    totalCount: number;
  };
  /** True while the rows of the search are on their way. */
  isLoadingRows: boolean;
  /** True when the search is text that IDs and types must start with, not a List Filter. */
  isPlainTextSearch?: boolean;
  /** How many runs the search matches. Undefined while the count loads. */
  matchCount?: number;
  onApply: (query: string) => void;
  onClearRecent: () => void;
  query: string;
  recentFilters: string[];
}) {
  const {
    counts,
    isLoadingRows,
    isPlainTextSearch = false,
    matchCount,
    onApply,
    onClearRecent,
    query,
    recentFilters,
  } = props;
  const activePreset = statusPresetOfQuery(query);
  const isCustom = activePreset === null;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 border-b border-border px-4 py-2">
      <ToggleGroup
        type="single"
        aria-label="Filter by status"
        className="flex-wrap justify-start gap-1"
        value={activePreset ?? ""}
        onValueChange={(next) =>
          onApply(
            next === "" || next === "All" ? "" : `ExecutionStatus = "${next}"`,
          )
        }
      >
        {STATUS_PRESETS.map((preset) => {
          const count =
            preset.status === "All"
              ? counts?.totalCount
              : counts
                ? (counts.countsByStatus[preset.status] ?? 0)
                : undefined;
          const isActive = activePreset === preset.status;

          if (preset.status !== "All" && count === 0 && !isActive) {
            return null;
          }

          return (
            <ToggleGroupItem
              key={preset.status}
              value={preset.status}
              aria-busy={isActive && isLoadingRows}
              data-testid={`temporal-status-pill-${preset.status}`}
              className={cn(
                pillClass,
                "data-[state=on]:bg-secondary data-[state=on]:font-medium",
              )}
            >
              {isActive && isLoadingRows ? (
                <Loader2 className="size-3 motion-safe:animate-spin" />
              ) : preset.status !== "All" ? (
                <WorkflowStatusIcon status={preset.status} />
              ) : null}
              <span>{preset.label}</span>
              {count !== undefined ? (
                <span className="font-mono tabular-nums text-muted-foreground">
                  {count.toLocaleString("en-US")}
                </span>
              ) : null}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      {isCustom || recentFilters.length > 0 ? (
        // Takes the width the presets leave on their row, so a long filter is cut short before it wraps.
        <div className="flex min-w-48 flex-1 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={
                  isCustom
                    ? `Current filter: ${query.trim()}. Open recent filters`
                    : "Recent filters"
                }
                aria-busy={isCustom && isLoadingRows}
                title={
                  !isCustom
                    ? undefined
                    : isPlainTextSearch
                      ? `Workflow ID, type or run ID starts with ${query.trim()}`
                      : query.trim()
                }
                data-testid="temporal-custom-filter"
                className={cn(
                  toggleVariants(),
                  pillClass,
                  "min-w-0 max-w-full [&_svg]:size-3",
                  isCustom &&
                    cn(
                      selectedPillClass,
                      "text-foreground shadow-sm ring-1 ring-border",
                    ),
                )}
              >
                {isCustom ? (
                  <>
                    {isLoadingRows ? (
                      <Loader2 className="motion-safe:animate-spin" />
                    ) : (
                      <ListFilter />
                    )}
                    {isPlainTextSearch ? (
                      <span className="shrink-0 font-normal text-muted-foreground">
                        starts with
                      </span>
                    ) : null}
                    <span className="truncate font-mono">{query.trim()}</span>
                    {matchCount !== undefined ? (
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {matchCount.toLocaleString("en-US")}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <History />
                    <span>Recent</span>
                  </>
                )}
                <ChevronDown className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[28rem] max-w-[calc(100vw-2rem)]"
            >
              <DropdownMenuLabel className="text-xs">
                Recent Filters
              </DropdownMenuLabel>
              {recentFilters.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  The filters you run show here.
                </p>
              ) : (
                <DropdownMenuRadioGroup
                  value={query.trim()}
                  onValueChange={onApply}
                >
                  {recentFilters.map((filter) => (
                    <DropdownMenuRadioItem
                      key={filter}
                      value={filter}
                      title={filter}
                      className="items-start font-mono text-xs"
                    >
                      <span className="min-w-0 break-words">{filter}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs"
                disabled={recentFilters.length === 0}
                onClick={onClearRecent}
              >
                Clear Recent Filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}
