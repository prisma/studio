import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Gauge,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { TemporalClusterShard, TemporalFollowMode } from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/components/ui/tooltip";
import {
  useTemporalClusterActions,
  useTemporalClusterOverview,
  useTemporalClusterTraces,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import {
  CLUSTER_HEALTH_STATES,
  describeClusterHealth,
  describeHealthTag,
  describeShardLifecycle,
  formatHealthReason,
  SHARD_LIFECYCLE_STATES,
} from "./temporal-cluster-health";
import { formatBytes, formatDuration, pluralize } from "./temporal-utils";
import {
  TemporalConfirmDialog,
  TemporalField,
  TemporalFollowControl,
  temporalIconScale,
  TemporalLoadError,
  TemporalRefreshError,
  TemporalStatusBadge,
  temporalTableHeadClass,
  TemporalTime,
  type TemporalTone,
  useNow,
} from "./TemporalPrimitives";
import { TemporalSparkline, TemporalSparklineCard } from "./TemporalSparkline";

const LOAD_WINDOWS = ["10s", "60s", "5m", "1h"];
const TREND_WINDOW_MS = 5 * 60_000;
const MAX_ADMISSION_TTL_S = 3_600;

/** A delay in milliseconds. Under 10 ms it keeps two decimals: a healthy shard lags by a fraction of a millisecond. */
function formatLag(ms: number): string {
  return ms < 10 ? `${ms.toFixed(2)}ms` : formatDuration(ms);
}

/** The fields of a sampled trace besides its Workflow ID, as `write_ms 1.2 · effect_ms 0.4`. */
function describeTraceFields(trace: Record<string, unknown>): string {
  return Object.entries(trace)
    .filter(
      ([key, value]) =>
        key !== "workflow_id" &&
        (typeof value === "number" ||
          typeof value === "string" ||
          typeof value === "boolean"),
    )
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(" · ");
}

const TONE_DOT_CLASS: Record<TemporalTone, string> = {
  danger: "bg-destructive",
  info: "bg-prism-cyan-600 dark:bg-prism-cyan-400",
  muted: "bg-muted-foreground/60",
  neutral: "bg-prism-cyan-600 dark:bg-prism-cyan-400",
  warning: "bg-amber-600 dark:bg-amber-400",
};

function capitalize(text: string): string {
  return text.length > 0 ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

function ShardStateLegendList(props: {
  currentKey: string;
  heading: string;
  items: ReadonlyArray<{
    key: string;
    label: string;
    meaning: string;
    tone: TemporalTone;
  }>;
}) {
  const { currentKey, heading, items } = props;
  const normalizedCurrent = currentKey.toLowerCase();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-2xs font-medium uppercase tracking-loose text-muted-foreground">
        {heading}
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const isCurrent = item.key === normalizedCurrent;

          return (
            <li
              key={item.key}
              className={cn(
                "flex items-start gap-2 rounded-md px-2 py-1.5",
                isCurrent && "bg-muted/70 ring-1 ring-border/80",
              )}
              data-current={isCurrent ? "true" : undefined}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  TONE_DOT_CLASS[item.tone],
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">
                    {item.label}
                  </span>
                  {isCurrent ? (
                    <span className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[10px] leading-none text-foreground">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="text-2xs leading-snug text-muted-foreground">
                  {item.meaning}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Whether the shard serves, and how loaded it is. Hovering reveals all possible
 * lifecycle and health states with descriptions and highlights the current ones.
 */
function ShardState(props: { shard: TemporalClusterShard }) {
  const { shard } = props;
  const lifecycle = describeShardLifecycle(shard.lifecycle);
  const health = describeClusterHealth(shard.health);
  const isServing = lifecycle.key === "serving";

  return (
    <div
      className="flex max-w-80 min-w-44 flex-col gap-1.5"
      data-testid={`temporal-shard-state-${shard.id}`}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Shard ${shard.id} state: ${lifecycle.label}, health ${health.label}. Hover or focus for all possible states.`}
            className="inline-flex w-fit cursor-help flex-wrap items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3"
            data-testid={`temporal-shard-state-trigger-${shard.id}`}
          >
            <TemporalStatusBadge
              icon={isServing ? Check : AlertTriangle}
              tone={lifecycle.tone}
            >
              {lifecycle.label}
            </TemporalStatusBadge>
            {shard.health === "ok" ? null : (
              <TemporalStatusBadge
                icon={health.tone === "info" ? Gauge : AlertTriangle}
                tone={health.tone}
              >
                {health.label}
              </TemporalStatusBadge>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent
          align="start"
          side="bottom"
          className="w-[min(36rem,calc(100vw-2rem))] p-3"
          data-testid={`temporal-shard-state-popup-${shard.id}`}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ShardStateLegendList
              currentKey={lifecycle.key}
              heading="Shard Lifecycle"
              items={SHARD_LIFECYCLE_STATES}
            />
            <ShardStateLegendList
              currentKey={health.key}
              heading="Shard Health"
              items={CLUSTER_HEALTH_STATES}
            />
          </div>
        </TooltipContent>
      </Tooltip>
      {shard.health === "ok" ? null : (
        <p className="text-2xs leading-snug text-muted-foreground">
          {health.meaning}
          {shard.healthReasons.length > 0 ? (
            <>
              {" "}
              Measured:{" "}
              <span className="font-mono text-foreground">
                {shard.healthReasons.map(formatHealthReason).join(", ")}
              </span>
              .
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

interface TemporalClusterViewProps {
  followMode: TemporalFollowMode;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
  onOpenExecution: (workflowId: string, runId?: string) => void;
}

export function TemporalClusterView(props: TemporalClusterViewProps) {
  const { followMode, onFollowModeChange, onOpenExecution } = props;

  const [windowParam, setWindowParam] = useState("10s");
  const { data, dataUpdatedAt, isError, error, refetch, isFetching } =
    useTemporalClusterOverview({ followMode, window: windowParam });
  // Renders again every few seconds, so the "as of" time keeps counting while refresh is paused.
  useNow(5_000, true);
  const { data: tracesData, refetch: refetchTraces } = useTemporalClusterTraces(
    { followMode },
  );
  const { drainTraces, handoffShard, liftAdmission, setAdmission } =
    useTemporalClusterActions();

  // Admission hold form state
  const [admClass, setAdmClass] = useState<
    "new" | "existing" | "batch" | "wait"
  >("new");
  const [admMode, setAdmMode] = useState<"limit" | "closed">("limit");
  const [admRate, setAdmRate] = useState("50");
  const [admTtl, setAdmTtl] = useState("300");
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  // Shard handoff sheet state
  const [handoffShardId, setHandoffShardId] = useState<number | null>(null);
  const [handoffTarget, setHandoffTarget] = useState("");
  const [handoffError, setHandoffError] = useState<string | null>(null);

  const rate = Number(admRate);
  const ttl = Number(admTtl);
  const rateError =
    admMode === "limit" && !(admRate.trim() !== "" && rate > 0)
      ? "Enter a rate above 0."
      : null;
  const ttlError =
    Number.isInteger(ttl) && ttl >= 1 && ttl <= MAX_ADMISSION_TTL_S
      ? null
      : `Enter 1 to ${MAX_ADMISSION_TTL_S} whole seconds.`;

  const applyAdmissionHold = async () => {
    if (rateError || ttlError) {
      return;
    }

    try {
      await setAdmission.mutateAsync({
        class: admClass,
        mode: admMode,
        ratePerS: admMode === "limit" ? rate : undefined,
        scope: "server",
        ttlS: ttl,
      });
      toast.success(
        `Applied ${admMode} hold on "${admClass}" for ${formatDuration(ttl * 1_000)}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const traceCount = tracesData?.traces.length ?? 0;
  const isSingleNode = data?.info.placementVersion === 1;
  const historySpanMs =
    data?.history && data.history.length > 1
      ? data.history[data.history.length - 1]!.at - data.history[0]!.at
      : 0;
  const historyTimes = data?.history?.map((sample) => sample.at);
  const serverReasons =
    data?.health.reasons.filter((reason) => reason.shard === undefined) ?? [];
  // The server reports a window only when asked for it, so the figure names the one it has.
  const headroom =
    data?.headroom.overall10s != null
      ? { label: "Headroom (10s)", value: data.headroom.overall10s }
      : data?.headroom.overall60s != null
        ? { label: "Headroom (60s)", value: data.headroom.overall60s }
        : null;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-cluster-view"
    >
      <StudioHeader
        title="Cluster & Shards"
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
              aria-label="Refresh Cluster & Shards"
              title="Refresh Cluster & Shards"
              onClick={() => {
                void refetch();
                void refetchTraces();
              }}
            >
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
          </>
        }
      />

      {data ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>The whole server, not one namespace</span>
            <Select value={windowParam} onValueChange={setWindowParam}>
              <SelectTrigger
                aria-label="Load window"
                className="h-7 w-auto gap-2 font-mono text-xs"
                label="Load window"
                title="The time the server reports its load over"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOAD_WINDOWS.map((w) => (
                  <SelectItem key={w} value={w} className="font-mono">
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
          {dataUpdatedAt ? (
            <span data-testid="temporal-cluster-as-of">
              As of <TemporalTime iso={new Date(dataUpdatedAt).toISOString()} />
              {followMode === "paused" ? " · Paused" : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {data && isError ? (
        <TemporalRefreshError
          error={error}
          onRetry={() => {
            void refetch();
            void refetchTraces();
          }}
        />
      ) : null}

      {!data ? (
        isError ? (
          <div className="flex flex-1 flex-col justify-center">
            <TemporalLoadError
              error={error}
              onRetry={() => void refetch()}
              title="Could not load the cluster diagnostics from the slate-temporal-next Admin API."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 text-xs *:shrink-0">
          <section className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <TemporalStatusBadge
                  icon={data.readyz.ready ? Check : AlertTriangle}
                  tone={data.readyz.ready ? "info" : "danger"}
                >
                  {capitalize(data.readyz.phase)}
                </TemporalStatusBadge>
                <span className="font-mono text-sm font-medium text-foreground">
                  slate-temporal-next v{data.info.version}
                </span>
                <span className="font-mono text-2xs text-muted-foreground">
                  rev {data.info.revision} · Temporal{" "}
                  {data.info.temporalApiRelease} · SlateDB{" "}
                  {data.info.slatedbRev}
                </span>
              </div>
              <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground">
                <ServerFact label="Store" value={data.info.storeKind} />
                <ServerFact
                  label="Placement"
                  value={`v${data.info.placementVersion}`}
                />
                <ServerFact
                  label="RSS"
                  title="Memory the server process holds (resident set size)"
                  value={
                    data.memory.rssBytes
                      ? formatBytes(data.memory.rssBytes)
                      : "—"
                  }
                />
                <ServerFact
                  label="Health"
                  value={describeClusterHealth(data.health.state).label}
                />
                <ServerFact
                  label={headroom?.label ?? "Headroom"}
                  title={`Spare capacity of ${data.headroom.binding || "the resource"} closest to its limit`}
                  value={
                    headroom ? `${Math.round(headroom.value * 100)}%` : "—"
                  }
                />
              </dl>
            </div>

            {data.health.state !== "ok" || data.health.tags.length > 0 ? (
              <p
                className="border-b border-border px-4 py-2 leading-snug text-muted-foreground"
                data-testid="temporal-cluster-health-note"
              >
                <span className="font-medium text-foreground">
                  {describeClusterHealth(data.health.state).label}.
                </span>{" "}
                {describeClusterHealth(data.health.state).meaning}
                {data.health.tags
                  .map((tag) => ` ${describeHealthTag(tag)}`)
                  .join("")}
                {serverReasons.length > 0 ? (
                  <>
                    {" "}
                    Measured:{" "}
                    <span className="font-mono text-foreground">
                      {serverReasons.map(formatHealthReason).join(", ")}
                    </span>
                    .
                  </>
                ) : null}
              </p>
            ) : null}

            <dl className="[&>*+*]:border-t [&>*+*]:border-border/60">
              {Object.entries(data.readyz.subsystems).map(([name, status]) => (
                <div
                  key={name}
                  className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)] items-baseline gap-4 px-4 py-2"
                >
                  <dt className="truncate font-mono font-medium text-foreground">
                    {name}
                  </dt>
                  <dd className="break-words font-mono text-muted-foreground">
                    {status}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {data.history && data.history.length > 0 ? (
            <section
              className="flex flex-col gap-2"
              data-testid="temporal-cluster-sparklines"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-sans text-sm font-semibold text-foreground">
                  Rolling 5-Minute Trends
                </h2>
                <span
                  className="text-2xs text-muted-foreground"
                  title="Studio samples the server while a page shows this screen"
                >
                  {pluralize(data.history.length, "sample")}
                  {historySpanMs > 0
                    ? ` over ${formatDuration(historySpanMs)}`
                    : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <TemporalSparklineCard
                  times={historyTimes}
                  windowMs={TREND_WINDOW_MS}
                  formatValue={(v) => `${v.toFixed(1)}/s`}
                  label="Runs Opened / s"
                  value={`${data.history[data.history.length - 1]!.runsOpenedPerS.toFixed(1)}/s`}
                  values={data.history.map((s) => s.runsOpenedPerS)}
                />
                <TemporalSparklineCard
                  times={historyTimes}
                  windowMs={TREND_WINDOW_MS}
                  formatValue={(v) => `${v.toFixed(1)}/s`}
                  label="Runs Closed / s"
                  value={`${data.history[data.history.length - 1]!.runsClosedPerS.toFixed(1)}/s`}
                  values={data.history.map((s) => s.runsClosedPerS)}
                />
                <TemporalSparklineCard
                  times={historyTimes}
                  windowMs={TREND_WINDOW_MS}
                  formatValue={(v) => `${v.toFixed(1)}/s`}
                  label="History Events / s"
                  value={`${data.history[data.history.length - 1]!.historyEventsPerS.toFixed(1)}/s`}
                  values={data.history.map((s) => s.historyEventsPerS)}
                />
                <TemporalSparklineCard
                  times={historyTimes}
                  windowMs={TREND_WINDOW_MS}
                  formatValue={(v) => formatDuration(v)}
                  label="Oldest Ready Task"
                  tone={
                    data.workerHint.matcherOldestReadyMs > 5_000
                      ? "warning"
                      : "info"
                  }
                  value={formatDuration(data.workerHint.matcherOldestReadyMs)}
                  values={data.history.map((s) => s.matcherOldestReadyMs)}
                />
                <TemporalSparklineCard
                  times={historyTimes}
                  windowMs={TREND_WINDOW_MS}
                  formatValue={formatLag}
                  label="Max Progress Lag"
                  tone={
                    data.history[data.history.length - 1]!.progressDelayMs > 250
                      ? "warning"
                      : "info"
                  }
                  value={formatLag(
                    data.history[data.history.length - 1]!.progressDelayMs,
                  )}
                  values={data.history.map((s) => s.progressDelayMs)}
                />
                <TemporalSparklineCard
                  times={historyTimes}
                  windowMs={TREND_WINDOW_MS}
                  formatValue={(v) => formatBytes(v)}
                  label="Unflushed WAL"
                  tone={
                    data.history[data.history.length - 1]!.l0Ssts > 8
                      ? "warning"
                      : "muted"
                  }
                  value={`${formatBytes(data.history[data.history.length - 1]!.unflushedBytes)} · ${data.history[data.history.length - 1]!.l0Ssts} L0`}
                  values={data.history.map((s) => s.unflushedBytes)}
                />
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 className="font-sans text-sm font-semibold text-foreground">
                Shards{" "}
                <span className="font-normal text-muted-foreground">
                  ({data.shards.length})
                </span>
              </h2>
              <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground">
                {isSingleNode ? (
                  <ServerFact
                    label="Handoff"
                    title="Moving a shard to another server needs a cell with more than one server (placement v2)"
                    value="single node, not available"
                  />
                ) : null}
                <ServerFact
                  label="Active storage"
                  value={formatBytes(data.storageActiveBytes)}
                />
                <ServerFact
                  label="Oldest ready task"
                  value={formatDuration(data.workerHint.matcherOldestReadyMs)}
                />
              </dl>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <TooltipProvider delayDuration={150}>
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="border-border/70 bg-muted/20 hover:bg-muted/20">
                      <TableHead className={cn(temporalTableHeadClass, "pl-4")}>
                        Shard
                      </TableHead>
                      <TableHead className={temporalTableHeadClass}>
                        State
                      </TableHead>
                      <TableHead className={temporalTableHeadClass}>
                        Admission
                      </TableHead>
                      <TableHead
                        className={cn(temporalTableHeadClass, "text-right")}
                        title="Sequence number of the last write the storage confirmed"
                      >
                        Durable Seq
                      </TableHead>
                      <TableHead
                        className={cn(temporalTableHeadClass, "text-right")}
                        title="How late the shard is with work it accepted"
                      >
                        Progress Lag
                      </TableHead>
                      <TableHead
                        className={cn(temporalTableHeadClass, "text-right")}
                        title="Level-0 storage files that wait for compaction, and what the compactor does now"
                      >
                        L0 / Compaction
                      </TableHead>
                      <TableHead
                        className={cn(
                          temporalTableHeadClass,
                          "text-right",
                          isSingleNode && "pr-4",
                        )}
                        title="Bytes written but not yet flushed to storage files"
                      >
                        Unflushed
                      </TableHead>
                      {isSingleNode ? null : (
                        <TableHead
                          className={cn(
                            temporalTableHeadClass,
                            "pr-4 text-right",
                          )}
                        >
                          Actions
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.shards.map((shard) => (
                      <TableRow
                        key={shard.id}
                        // No hover highlight: a row opens nothing.
                        className="border-border/60 hover:bg-transparent"
                        data-testid={`temporal-shard-row-${shard.id}`}
                      >
                        <TableCell className="whitespace-nowrap py-2.5 pr-2 pl-4 font-mono">
                          <span className="font-medium text-foreground">
                            shard/{shard.id}
                          </span>{" "}
                          <span
                            className="text-muted-foreground"
                            title="Generation: goes up by one each time the shard is handed off"
                          >
                            gen {shard.generation}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 py-2.5 whitespace-normal">
                          <ShardState shard={shard} />
                        </TableCell>
                        <TableCell className="px-2 py-2.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
                            <AdmissionMode
                              label="existing"
                              mode={shard.admissionMode.existing}
                            />
                            <AdmissionMode
                              label="new"
                              mode={shard.admissionMode.new}
                            />
                            <AdmissionMode
                              label="batch"
                              mode={shard.admissionMode.batch}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {shard.durableSeq}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                          <div className="inline-flex items-center justify-end gap-2">
                            {shard.progressDelayHistory &&
                            shard.progressDelayHistory.length > 0 ? (
                              <TemporalSparkline
                                formatValue={formatLag}
                                height={18}
                                label={`Shard ${shard.id} progress lag`}
                                tone={
                                  shard.progressDelayMs > 250
                                    ? "warning"
                                    : "info"
                                }
                                values={shard.progressDelayHistory}
                                width={52}
                              />
                            ) : null}
                            <span>{formatLag(shard.progressDelayMs)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                          {shard.l0Ssts} L0 · {shard.compactionState}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "px-2 py-2.5 text-right font-mono whitespace-nowrap text-muted-foreground tabular-nums",
                            isSingleNode && "pr-4",
                          )}
                        >
                          {formatBytes(shard.unflushedBytes)}
                        </TableCell>
                        {isSingleNode ? null : (
                          <TableCell className="py-2.5 pr-4 pl-2 text-right">
                            <Button
                              variant="outline"
                              size="xs"
                              aria-label={`Hand off shard/${shard.id}`}
                              onClick={() => {
                                setHandoffError(null);
                                setHandoffShardId(shard.id);
                              }}
                            >
                              <ArrowRightLeft />
                              Hand Off
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-1">
                <h2 className="flex h-8 items-center font-sans text-sm font-semibold text-foreground">
                  Admission Control
                </h2>
                <p className="text-muted-foreground">
                  Limit or close one traffic class on this server for a fixed
                  time.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <TemporalField htmlFor="adm-class" label="Traffic Class">
                  <Select
                    value={admClass}
                    onValueChange={(v) =>
                      setAdmClass(v as "new" | "existing" | "batch" | "wait")
                    }
                  >
                    <SelectTrigger
                      id="adm-class"
                      className="h-8 font-mono text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["new", "existing", "batch", "wait"].map((value) => (
                        <SelectItem
                          key={value}
                          value={value}
                          className="font-mono"
                        >
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TemporalField>

                <TemporalField htmlFor="adm-mode" label="Mode">
                  <Select
                    value={admMode}
                    onValueChange={(v) =>
                      setAdmMode(v === "closed" ? "closed" : "limit")
                    }
                  >
                    <SelectTrigger
                      id="adm-mode"
                      className="h-8 font-mono text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="limit" className="font-mono">
                        limit
                      </SelectItem>
                      <SelectItem value="closed" className="font-mono">
                        closed
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </TemporalField>

                <TemporalField htmlFor="adm-rate" label="Rate / s">
                  <Input
                    id="adm-rate"
                    type="number"
                    min={1}
                    disabled={admMode === "closed"}
                    aria-describedby={rateError ? "adm-rate-error" : undefined}
                    aria-invalid={rateError !== null}
                    value={admRate}
                    onChange={(e) => setAdmRate(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                  {rateError ? (
                    <p
                      id="adm-rate-error"
                      className="text-2xs text-destructive"
                    >
                      {rateError}
                    </p>
                  ) : null}
                </TemporalField>

                <TemporalField
                  htmlFor="adm-ttl"
                  label={`TTL (s, max ${MAX_ADMISSION_TTL_S})`}
                >
                  <Input
                    id="adm-ttl"
                    type="number"
                    min={1}
                    max={MAX_ADMISSION_TTL_S}
                    aria-describedby={ttlError ? "adm-ttl-error" : undefined}
                    aria-invalid={ttlError !== null}
                    value={admTtl}
                    onChange={(e) => setAdmTtl(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                  {ttlError ? (
                    <p id="adm-ttl-error" className="text-2xs text-destructive">
                      {ttlError}
                    </p>
                  ) : null}
                </TemporalField>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={admMode === "closed" ? "destructive" : "default"}
                  disabled={
                    setAdmission.isPending ||
                    rateError !== null ||
                    ttlError !== null
                  }
                  onClick={() => {
                    if (admMode === "closed") {
                      setConfirmCloseOpen(true);
                    } else {
                      void applyAdmissionHold();
                    }
                  }}
                  data-testid="temporal-admission-apply-btn"
                >
                  {admMode === "closed" ? "Close Class" : "Apply Rate Hold"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={liftAdmission.isPending}
                  onClick={() =>
                    void liftAdmission
                      .mutateAsync({ class: admClass, scope: "server" })
                      .then(() =>
                        toast.success(`Lifted admission hold on "${admClass}"`),
                      )
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : String(e)),
                      )
                  }
                  data-testid="temporal-admission-lift-btn"
                >
                  Lift &quot;{admClass}&quot; Hold
                </Button>
              </div>
            </section>

            <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-1">
                <div className="flex h-8 items-center justify-between gap-3">
                  <h2 className="font-sans text-sm font-semibold text-foreground">
                    Sampled Run Traces{" "}
                    <span className="font-normal text-muted-foreground">
                      ({traceCount} of {tracesData?.capacity ?? 4096})
                    </span>
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={drainTraces.isPending || traceCount === 0}
                    title="Read every trace and remove it from the server's buffer"
                    onClick={() =>
                      void drainTraces
                        .mutateAsync()
                        .then((res) =>
                          toast.success(
                            `Drained ${pluralize(res.traces.length, "trace")}`,
                          ),
                        )
                        .catch((e) =>
                          toast.error(
                            e instanceof Error ? e.message : String(e),
                          ),
                        )
                    }
                  >
                    Drain Traces
                  </Button>
                </div>
                <p className="text-muted-foreground">
                  The commits the server sampled, with the fields it reports for
                  each.
                </p>
              </div>

              {!tracesData || traceCount === 0 ? (
                <p className="text-muted-foreground">
                  No sampled traces. Turn on trace sampling on the server to see
                  them here.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-md border border-border [&>*+*]:border-t [&>*+*]:border-border/60">
                  {tracesData.traces.slice(0, 20).map((trace, idx) => {
                    const wfId =
                      typeof trace.workflow_id === "string"
                        ? trace.workflow_id
                        : undefined;
                    const fields = describeTraceFields(trace);

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 px-3 py-1.5 font-mono"
                        title={JSON.stringify(trace, null, 2)}
                      >
                        <span className="flex min-w-0 items-baseline gap-3">
                          <span className="truncate text-foreground">
                            {wfId ?? "No Workflow ID"}
                          </span>
                          <span className="truncate text-2xs text-muted-foreground">
                            {fields}
                          </span>
                        </span>
                        {wfId ? (
                          <Button
                            variant="outline"
                            size="xs"
                            className="shrink-0 font-sans"
                            onClick={() => onOpenExecution(wfId)}
                          >
                            Inspect
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      <Sheet
        open={handoffShardId !== null}
        onOpenChange={(o) => !o && setHandoffShardId(null)}
      >
        <SheetContent
          className={cn(
            "flex w-full flex-col gap-0 p-0 sm:max-w-lg",
            temporalIconScale,
          )}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("handoff-target")?.focus();
          }}
        >
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle className="text-base">
              Hand Off <span className="font-mono">shard/{handoffShardId}</span>
            </SheetTitle>
            <SheetDescription className="text-xs">
              Move this shard to another server in the cell. The shard
              generation increases by one and in-flight commits drain first.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 text-xs *:shrink-0">
            <TemporalField htmlFor="handoff-target" label="Target Server ID">
              <Input
                id="handoff-target"
                value={handoffTarget}
                onChange={(e) => setHandoffTarget(e.target.value)}
                placeholder="Server ID"
                className="h-8 font-mono text-xs"
              />
            </TemporalField>
            {handoffError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 font-mono text-foreground">
                {handoffError}
              </div>
            ) : null}
          </div>
          <SheetFooter className="border-t border-border px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHandoffShardId(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                handoffShard.isPending ||
                handoffShardId === null ||
                !handoffTarget.trim()
              }
              onClick={() => {
                if (handoffShardId === null) return;
                setHandoffError(null);
                void handoffShard
                  .mutateAsync({
                    shardId: handoffShardId,
                    targetServerId: handoffTarget.trim(),
                  })
                  .then(() => {
                    toast.success(
                      `Handed off shard/${handoffShardId} to ${handoffTarget.trim()}`,
                    );
                    setHandoffShardId(null);
                  })
                  .catch((err) => {
                    setHandoffError(
                      err instanceof Error ? err.message : String(err),
                    );
                  });
              }}
            >
              Hand Off Shard
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <TemporalConfirmDialog
        confirmLabel={`Close "${admClass}" Traffic`}
        description={`This rejects incoming "${admClass}" requests for ${formatDuration(ttl * 1_000)}, or until you lift the hold.`}
        isPending={setAdmission.isPending}
        onConfirm={applyAdmissionHold}
        onOpenChange={setConfirmCloseOpen}
        open={confirmCloseOpen}
        title="Close this traffic class?"
      />
    </div>
  );
}

function ServerFact(props: { label: string; title?: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5" title={props.title}>
      <dt>{props.label}</dt>
      <dd className="font-mono text-foreground">{props.value}</dd>
    </div>
  );
}

function AdmissionMode(props: { label: string; mode: string }) {
  const { label, mode } = props;

  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      {mode === "open" ? (
        <span className="text-foreground">open</span>
      ) : (
        <TemporalStatusBadge tone={mode === "closed" ? "danger" : "warning"}>
          {mode}
        </TemporalStatusBadge>
      )}
    </span>
  );
}
