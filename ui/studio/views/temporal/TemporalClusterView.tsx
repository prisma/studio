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
  useTemporalClusterActions,
  useTemporalClusterOverview,
  useTemporalClusterTraces,
} from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import {
  describeClusterHealth,
  describeHealthTag,
  formatHealthReason,
} from "./temporal-cluster-health";
import { formatBytes, formatDuration, pluralize } from "./temporal-utils";
import {
  TemporalConfirmDialog,
  TemporalField,
  TemporalFollowControl,
  temporalIconScale,
  TemporalStatusBadge,
  temporalTableHeadClass,
} from "./TemporalPrimitives";

const LOAD_WINDOWS = ["10s", "60s", "5m", "1h"];

function capitalize(text: string): string {
  return text.length > 0 ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

/**
 * Whether the shard serves, and how loaded it is. A state other than `ok`
 * comes with what it means and with the measurements the server gives for it.
 */
function ShardState(props: {
  serverTags: string[];
  shard: TemporalClusterShard;
}) {
  const { serverTags, shard } = props;
  const health = describeClusterHealth(shard.health);
  const isServing = shard.lifecycle === "serving";

  return (
    <div
      className="flex max-w-80 min-w-44 flex-col gap-1.5"
      data-testid={`temporal-shard-state-${shard.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <TemporalStatusBadge
          icon={isServing ? Check : AlertTriangle}
          tone={isServing ? "neutral" : "warning"}
        >
          {capitalize(shard.lifecycle)}
        </TemporalStatusBadge>
        {shard.health === "ok" ? null : (
          <TemporalStatusBadge
            icon={health.tone === "info" ? Gauge : AlertTriangle}
            tone={health.tone}
          >
            {health.label}
          </TemporalStatusBadge>
        )}
      </div>
      {shard.health === "ok" ? null : (
        <p className="text-2xs leading-snug text-muted-foreground">
          {health.meaning}
          {serverTags.map((tag) => ` ${describeHealthTag(tag)}`).join("")}
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
  const { data, isLoading, isError, error, refetch, isFetching } =
    useTemporalClusterOverview({ followMode, window: windowParam });
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

  const applyAdmissionHold = async () => {
    try {
      await setAdmission.mutateAsync({
        class: admClass,
        mode: admMode,
        ratePerS: admMode === "limit" ? Number(admRate) || 50 : undefined,
        scope: "server",
        ttlS: Number(admTtl) || 300,
      });
      toast.success(`Applied ${admMode} hold on "${admClass}" for ${admTtl}s`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const traceCount = tracesData?.traces.length ?? 0;
  const isSingleNode = data?.info.placementVersion === 1;

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
            <Select value={windowParam} onValueChange={setWindowParam}>
              <SelectTrigger
                aria-label="Load metrics window"
                className="h-8 w-20 font-mono text-xs"
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
            <TemporalFollowControl
              value={followMode}
              onChange={onFollowModeChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-8 px-0"
              aria-label="Refresh cluster diagnostics"
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

      {isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isError || !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
          <p className="font-medium text-destructive">
            {error instanceof Error
              ? error.message
              : "The slate-temporal-next Admin API is unavailable"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
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
                  label="Headroom (10s)"
                  value={
                    data.headroom.overall10s != null
                      ? `${Math.round(data.headroom.overall10s * 100)}%`
                      : "—"
                  }
                />
              </dl>
            </div>

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

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 className="font-sans text-sm font-semibold text-foreground">
                Shards{" "}
                <span className="font-normal text-muted-foreground">
                  ({data.shards.length})
                </span>
              </h2>
              <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground">
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
                    >
                      Durable Seq
                    </TableHead>
                    <TableHead
                      className={cn(temporalTableHeadClass, "text-right")}
                    >
                      Progress Lag
                    </TableHead>
                    <TableHead
                      className={cn(temporalTableHeadClass, "text-right")}
                    >
                      L0 / Compaction
                    </TableHead>
                    <TableHead
                      className={cn(temporalTableHeadClass, "text-right")}
                    >
                      Unflushed
                    </TableHead>
                    <TableHead
                      className={cn(temporalTableHeadClass, "pr-4 text-right")}
                    >
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.shards.map((shard) => (
                    <TableRow
                      key={shard.id}
                      className="border-border/60 hover:bg-muted/30"
                      data-testid={`temporal-shard-row-${shard.id}`}
                    >
                      <TableCell className="whitespace-nowrap py-2.5 pr-2 pl-4 font-mono">
                        <span className="font-medium text-foreground">
                          shard/{shard.id}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          gen {shard.generation}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-2.5 whitespace-normal">
                        <ShardState
                          serverTags={data.health.tags}
                          shard={shard}
                        />
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
                        {shard.progressDelayMs.toFixed(2)}ms
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {shard.l0Ssts} L0 · {shard.compactionState}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {formatBytes(shard.unflushedBytes)}
                      </TableCell>
                      <TableCell className="py-2.5 pr-4 pl-2 text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setHandoffError(null);
                            setHandoffShardId(shard.id);
                          }}
                        >
                          <ArrowRightLeft />
                          Handoff
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                    disabled={admMode === "closed"}
                    value={admRate}
                    onChange={(e) => setAdmRate(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </TemporalField>

                <TemporalField htmlFor="adm-ttl" label="TTL (s, max 3600)">
                  <Input
                    id="adm-ttl"
                    type="number"
                    value={admTtl}
                    onChange={(e) => setAdmTtl(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </TemporalField>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={admMode === "closed" ? "destructive" : "default"}
                  disabled={setAdmission.isPending}
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
                  Lift Hold on {admClass}
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
                  Write and effect latency for sampled commits.
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
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 px-3 py-1.5 font-mono"
                      >
                        <span className="truncate text-foreground">
                          {wfId ?? JSON.stringify(trace).slice(0, 80)}
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
            {isSingleNode ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
                <p>
                  This server runs as a single node (placement v1). Shard
                  handoff needs a multi-node placement v2 cell.
                </p>
              </div>
            ) : null}
            <TemporalField htmlFor="handoff-target" label="Target Server ID">
              <Input
                id="handoff-target"
                value={handoffTarget}
                disabled={isSingleNode}
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
                isSingleNode ||
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
        description={`This rejects incoming "${admClass}" requests for ${admTtl} seconds, or until you lift the hold.`}
        isPending={setAdmission.isPending}
        onConfirm={applyAdmissionHold}
        onOpenChange={setConfirmCloseOpen}
        open={confirmCloseOpen}
        title="Close this traffic class?"
      />
    </div>
  );
}

function ServerFact(props: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
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
