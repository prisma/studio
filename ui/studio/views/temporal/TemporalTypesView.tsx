import { RefreshCw, Search, Waypoints } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  TemporalFollowMode,
  TemporalRunRef,
  TemporalTypeMapNode,
  TemporalTypeMapResponse,
  TemporalWorkflowStatus,
} from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useTemporalFacets, useTemporalTypeMap } from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import { formatDuration, pluralize } from "./temporal-utils";
import {
  TemporalFollowControl,
  temporalIconScale,
  TemporalLoadError,
  TemporalNamespaceBadge,
  TemporalRefreshError,
  TemporalSectionLabel,
  TemporalTime,
  useNow,
  WorkflowStatusIcon,
  workflowStatusLabel,
} from "./TemporalPrimitives";
import {
  TemporalTypeMapCanvas,
  TYPE_MAP_STEP_KINDS,
  typeMapStepName,
} from "./TemporalTypeMapCanvas";

interface TemporalTypesViewProps {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
}

/** The statuses in the order the Workflows screen lists them. */
const STATUS_ORDER: TemporalWorkflowStatus[] = [
  "Running",
  "Paused",
  "Completed",
  "ContinuedAsNew",
  "Failed",
  "TimedOut",
  "Canceled",
  "Terminated",
];

/**
 * One diagram per Workflow Type. Temporal stores no definition of a Workflow:
 * the Workflow is code that runs on a Worker. So Studio draws a type from the
 * steps that a sample of its runs took.
 */
export function TemporalTypesView(props: TemporalTypesViewProps) {
  const { followMode, namespace, onFollowModeChange, onOpenExecution } = props;
  const { createUrl, setTemporalTypeParam, temporalTypeParam } =
    useNavigation();
  const facets = useTemporalFacets(namespace);
  const types = useMemo(
    () => facets.data?.workflowTypes ?? [],
    [facets.data?.workflowTypes],
  );
  const [typeSearch, setTypeSearch] = useState("");
  const filteredTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    if (!q) {
      return types;
    }
    return types.filter((type) => type.name.toLowerCase().includes(q));
  }, [typeSearch, types]);
  // The list is in order of run count, which changes; the type on screen must not change with it.
  const [firstListedType, setFirstListedType] = useState<string | null>(null);
  const isFirstTypeListed = types.some((type) => type.name === firstListedType);

  if (!isFirstTypeListed && types[0] && types[0].name !== firstListedType) {
    setFirstListedType(types[0].name);
  }

  const activeType =
    temporalTypeParam ??
    (isFirstTypeListed ? firstListedType : types[0]?.name) ??
    null;
  const map = useTemporalTypeMap({
    followMode,
    namespace,
    workflowType: activeType,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null);
  const activeVersion =
    selectedBuildId && map.data?.versions
      ? (map.data.versions.find((v) => v.buildId === selectedBuildId) ?? null)
      : null;
  const shownMap = useMemo(
    () =>
      map.data && activeVersion
        ? { ...map.data, ...activeVersion.map }
        : map.data,
    [activeVersion, map.data],
  );
  const selected =
    shownMap?.nodes.find((node) => node.id === selectedId) ?? null;
  // The moment the BFF drew the diagram, so its age keeps counting between requests.
  const drawnAt = useMemo(
    () =>
      map.data
        ? new Date(
            (map.dataUpdatedAt || Date.now()) - map.data.ageMs,
          ).toISOString()
        : undefined,
    [map.data, map.dataUpdatedAt],
  );
  const isKnownType = types.some((type) => type.name === activeType);

  useEffect(() => {
    setSelectedId(null);
    setSelectedBuildId(null);
  }, [activeType]);

  const workflowsUrl = (filter: string) =>
    createUrl({
      searchParam: filter,
      temporalNsParam: namespace,
      temporalSectionParam: "workflows",
      viewParam: "temporal",
    });
  const typeFilter = `WorkflowType = "${activeType ?? ""}"`;

  return (
    <div
      className={cn(
        "@container flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-types-view"
    >
      <StudioHeader
        title="Workflow Types"
        endContent={
          <>
            <TemporalFollowControl
              value={followMode}
              onChange={onFollowModeChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-8 px-0"
              aria-label="Refresh Workflow Types"
              title="Refresh Workflow Types"
              onClick={() => {
                void facets.refetch();
                void map.refetch();
              }}
            >
              <RefreshCw
                className={cn(map.isFetching && "motion-safe:animate-spin")}
              />
            </Button>
          </>
        }
      >
        <span className="contents @max-3xl:hidden">
          <TemporalNamespaceBadge namespace={namespace} />
        </span>
      </StudioHeader>

      <div className="flex min-h-0 flex-1 flex-col @3xl:flex-row">
        <nav
          aria-label="Workflow Types"
          className="flex max-h-44 w-full shrink-0 flex-col gap-1 border-b border-border p-2 @3xl:max-h-none @3xl:w-60 @3xl:border-r @3xl:border-b-0"
        >
          {types.length > 0 ? (
            <div className="relative flex items-center pb-1">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
              <Input
                aria-label="Filter Workflow Types"
                value={typeSearch}
                onChange={(e) => setTypeSearch(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && typeSearch) {
                    event.stopPropagation();
                    setTypeSearch("");
                  }
                }}
                placeholder="Filter types"
                className="h-7 pl-7 text-xs"
                data-testid="temporal-type-filter"
              />
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {facets.isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))
            ) : facets.isError && types.length === 0 ? (
              // Without a type in the URL the pane beside the list says so, with Retry.
              activeType === null ? null : (
                <div className="flex flex-col items-start gap-2 p-2 text-xs text-muted-foreground">
                  <p>Could not load the list of Workflow Types.</p>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void facets.refetch()}
                  >
                    Retry
                  </Button>
                </div>
              )
            ) : types.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                No Workflow has run in this namespace yet.
              </p>
            ) : filteredTypes.length === 0 ? (
              <div className="flex flex-col items-start gap-2 p-2 text-xs text-muted-foreground">
                <p>No Workflow Type matches this filter.</p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setTypeSearch("")}
                >
                  Clear Filter
                </Button>
              </div>
            ) : (
              filteredTypes.map((type) => (
                <button
                  key={type.name}
                  type="button"
                  aria-current={type.name === activeType ? "true" : undefined}
                  className={cn(
                    "flex h-8 w-full shrink-0 items-center justify-between gap-2 rounded-md px-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    type.name === activeType
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  data-testid={`temporal-type-${type.name}`}
                  onClick={() => void setTemporalTypeParam(type.name)}
                  title={type.name}
                >
                  <span className="min-w-0 truncate font-mono">
                    {type.name}
                  </span>
                  {/* Without every run of the namespace the count is that of a sample. */}
                  {facets.data?.complete ? (
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                      {type.count.toLocaleString("en-US")}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          {activeType === null && facets.isError ? (
            <div className="flex flex-1 flex-col justify-center">
              <TemporalLoadError
                error={facets.error}
                onRetry={() => void facets.refetch()}
                title={
                  <>
                    Could not load the Workflow Types of namespace{" "}
                    <code className="font-mono">{namespace}</code>.
                  </>
                }
              />
            </div>
          ) : activeType === null && !facets.isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
              <Waypoints className="size-6 opacity-60" />
              <p>Start a Workflow to see its steps here.</p>
            </div>
          ) : map.isError && !shownMap ? (
            <div className="flex flex-1 flex-col justify-center">
              <TemporalLoadError
                error={map.error}
                onRetry={() => void map.refetch()}
                title={
                  <>
                    Could not draw Workflow Type{" "}
                    <code className="font-mono">{activeType}</code>.
                  </>
                }
              />
            </div>
          ) : !shownMap ? (
            <div className="flex flex-1 flex-col items-center gap-4 p-8">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-14 w-60" />
              <Skeleton className="h-14 w-60" />
              <Skeleton className="h-14 w-60" />
            </div>
          ) : (
            <>
              {map.isError ? (
                <TemporalRefreshError
                  error={map.error}
                  onRetry={() => void map.refetch()}
                />
              ) : null}
              <SampleLine
                drawnAt={drawnAt}
                map={shownMap}
                workflowsUrl={workflowsUrl(typeFilter)}
              />
              {map.data?.versions && map.data.versions.length > 1 ? (
                <div
                  className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-4 py-1.5 text-xs"
                  data-testid="temporal-type-versions"
                >
                  <span className="text-muted-foreground">Worker version:</span>
                  <Button
                    variant={selectedBuildId === null ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => {
                      setSelectedBuildId(null);
                      setSelectedId(null);
                    }}
                  >
                    All ({map.data.runCount})
                  </Button>
                  {map.data.versions.map((version) => (
                    <Button
                      key={version.buildId}
                      variant={
                        selectedBuildId === version.buildId
                          ? "secondary"
                          : "ghost"
                      }
                      size="xs"
                      className="font-mono"
                      onClick={() => {
                        setSelectedBuildId(version.buildId);
                        setSelectedId(null);
                      }}
                    >
                      {version.buildId}{" "}
                      <span className="font-sans text-muted-foreground">
                        ({version.runCount})
                      </span>
                    </Button>
                  ))}
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                {shownMap.runCount === 0 ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    {facets.data && !isKnownType
                      ? "No Workflow of this type has run in this namespace."
                      : "No run of this type has a history that Studio can read."}
                  </p>
                ) : (
                  <TemporalTypeMapCanvas
                    map={shownMap}
                    onSelect={setSelectedId}
                    selectedId={selectedId}
                  />
                )}
              </div>
              {selected ? (
                <NodeDetail
                  node={selected}
                  onOpenExecution={onOpenExecution}
                  statusUrl={
                    selected.status
                      ? workflowsUrl(
                          `${typeFilter} AND ExecutionStatus = "${selected.status}"`,
                        )
                      : undefined
                  }
                  totalRuns={shownMap.runCount}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Which runs the diagram is drawn from, so its counts are not read as counts of all runs. */
function SampleLine(props: {
  drawnAt?: string;
  map: TemporalTypeMapResponse;
  workflowsUrl: string;
}) {
  const { drawnAt, map, workflowsUrl } = props;

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground"
      data-testid="temporal-type-sample"
    >
      <span className="font-mono text-sm font-medium text-foreground">
        {map.workflowType}
      </span>
      <span>
        Drawn from{" "}
        <span className="font-medium tabular-nums text-foreground">
          {map.runCount}
        </span>
        {map.candidatesComplete && map.candidateCount > map.runCount
          ? ` of ${map.candidateCount.toLocaleString("en-US")}`
          : ""}{" "}
        {map.runCount === 1 ? "run" : "runs"}
        {map.candidateCount <= map.runCount
          ? ""
          : map.candidatesComplete
            ? ": the newest, and the newest of each status"
            : // A namespace too large to copy: the BFF knows one page of the type's runs.
              ", chosen from its running runs and one page of its other runs"}
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {STATUS_ORDER.filter((status) => map.statusCounts[status]).map(
          (status) => (
            <span key={status} className="flex items-center gap-1">
              <WorkflowStatusIcon status={status} />
              <span className="tabular-nums text-foreground">
                {map.statusCounts[status]}
              </span>{" "}
              {workflowStatusLabel(status)}
            </span>
          ),
        )}
      </span>
      {map.truncatedRunCount > 0 ? (
        <span>
          {map.truncatedRunCount} with a history longer than Studio reads
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-4">
        {drawnAt ? (
          <span>
            Drawn <TickingTime iso={drawnAt} />
          </span>
        ) : null}
        <a
          className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          href={workflowsUrl}
        >
          Open every run of this type in Executions
        </a>
      </span>
    </div>
  );
}

/** A time whose relative form keeps counting while nothing else renders. */
function TickingTime(props: { iso: string }) {
  useNow(1_000, true);

  return <TemporalTime iso={props.iso} />;
}

function RunLinks(props: {
  label: string;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  runs: TemporalRunRef[];
  total: number;
}) {
  const { label, onOpenExecution, runs, total } = props;

  if (runs.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <TemporalSectionLabel>
        {label}
        {total > runs.length ? ` (${runs.length} of ${total})` : ""}
      </TemporalSectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {runs.map((run) => (
          <Button
            key={run.runId}
            variant="outline"
            size="xs"
            className="max-w-56 font-mono"
            onClick={() => onOpenExecution(run.workflowId, run.runId)}
            title={run.workflowId}
          >
            <span className="truncate">{run.workflowId}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

/** What the sampled runs did at the selected node, with runs to open. */
function NodeDetail(props: {
  node: TemporalTypeMapNode;
  onOpenExecution: (workflowId: string, runId?: string) => void;
  statusUrl?: string;
  totalRuns: number;
}) {
  const { node, onOpenExecution, statusUrl, totalRuns } = props;

  if (node.kind === "start") {
    return null;
  }

  if (node.kind === "end") {
    return (
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground"
        data-testid="temporal-type-node-detail"
      >
        <span>
          <span className="font-medium tabular-nums text-foreground">
            {node.runCount} of {totalRuns}
          </span>{" "}
          sampled runs closed as{" "}
          <span className="font-medium text-foreground">
            {workflowStatusLabel(node.status ?? "Completed")}
          </span>
          .
        </span>
        {statusUrl ? (
          <a
            className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
            href={statusUrl}
          >
            Open every such run in Executions
          </a>
        ) : null}
      </div>
    );
  }

  const kind = TYPE_MAP_STEP_KINDS[node.kind];
  const facts = [
    ["Runs", `${node.runCount} of ${totalRuns}`],
    node.spanCount > node.runCount
      ? ["Times", node.spanCount.toLocaleString("en-US")]
      : null,
    node.medianDurationMs === undefined
      ? null
      : ["Median", formatDuration(node.medianDurationMs)],
    node.retriedRunCount > 0
      ? ["Retried in", pluralize(node.retriedRunCount, "run")]
      : null,
  ].filter((fact) => fact !== null) as Array<[string, string]>;

  return (
    <div
      className="flex max-h-56 flex-col gap-3 overflow-y-auto border-t border-border px-4 py-3 text-xs"
      data-testid="temporal-type-node-detail"
    >
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="font-mono text-sm font-medium text-foreground">
          {typeMapStepName(node)}
        </span>
        {kind.name === typeMapStepName(node) ? null : (
          <span className="text-muted-foreground">{kind.name}</span>
        )}
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-muted-foreground">
          {facts.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dt>{label}</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <RunLinks
          label="Runs at This Step Now"
          onOpenExecution={onOpenExecution}
          runs={node.waitingRuns}
          total={node.waitingRunCount}
        />
        <RunLinks
          label="Runs in Which It Failed"
          onOpenExecution={onOpenExecution}
          runs={node.failedRuns}
          total={node.failedRunCount}
        />
      </div>
    </div>
  );
}
