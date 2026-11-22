import {
  Activity,
  ArrowRightLeft,
  Check,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { TemporalFollowMode } from "@/data/temporal";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
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
import { formatBytes, formatDuration } from "./temporal-utils";
import {
  TemporalConfirmDialog,
  TemporalFollowControl,
} from "./TemporalPrimitives";

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

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-testid="temporal-cluster-view"
    >
      <StudioHeader
        title="Cluster & Shards"
        endContent={
          <div className="flex items-center gap-1.5">
            <Select value={windowParam} onValueChange={setWindowParam}>
              <SelectTrigger
                aria-label="Load metrics window"
                className="h-7 w-20 font-mono text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10s", "60s", "1m", "5m", "1h"].map((w) => (
                  <SelectItem key={w} value={w} className="font-mono text-xs">
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
              className="h-7 px-2 text-xs"
              aria-label="Refresh cluster diagnostics"
              onClick={() => {
                void refetch();
                void refetchTraces();
              }}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  isFetching && "motion-safe:animate-spin",
                )}
              />
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isError || !data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-xs text-muted-foreground">
          <p className="font-medium text-destructive">
            {error instanceof Error
              ? error.message
              : "slate-temporal-next Admin API is unavailable"}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-xs">
          {/* Server Identity & Readiness Bar */}
          <section className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1 font-medium text-[11px] capitalize",
                    data.readyz.ready
                      ? "border-prism-cyan-500/40 bg-prism-cyan-500/10 text-prism-cyan-700 dark:text-prism-cyan-300"
                      : "border-destructive/50 bg-destructive/10 text-destructive",
                  )}
                >
                  <Check className="size-3" />
                  {data.readyz.phase}
                </Badge>
                <span className="font-mono font-semibold text-foreground">
                  slate-temporal-next v{data.info.version}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  rev {data.info.revision} · Temporal{" "}
                  {data.info.temporalApiRelease} · SlateDB{" "}
                  {data.info.slatedbRev}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground">
                <span>store: {data.info.storeKind}</span>
                <span>placement: v{data.info.placementVersion}</span>
                <span>
                  RSS:{" "}
                  <strong className="text-foreground">
                    {data.memory.rssBytes
                      ? formatBytes(data.memory.rssBytes)
                      : "—"}
                  </strong>
                </span>
                <span>
                  headroom ({windowParam}):{" "}
                  <strong className="text-foreground">
                    {data.headroom.overall10s != null
                      ? `${Math.round(data.headroom.overall10s * 100)}%`
                      : "—"}
                  </strong>
                </span>
              </div>
            </div>

            <div className="divide-y divide-border px-4">
              {Object.entries(data.readyz.subsystems).map(([name, status]) => (
                <div
                  key={name}
                  className="flex items-baseline justify-between gap-4 py-1.5 text-[11px]"
                >
                  <span className="shrink-0 font-mono font-medium text-foreground">
                    {name}
                  </span>
                  <span className="truncate font-mono text-muted-foreground">
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Shards & SlateDB Storage Grid */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-xs font-semibold text-foreground">
                Shards &amp; SlateDB Storage ({data.shards.length})
              </h2>
              <span className="font-mono text-[11px] text-muted-foreground">
                Active storage: {formatBytes(data.storageActiveBytes)} · Matcher
                oldest ready:{" "}
                {formatDuration(data.workerHint.matcherOldestReadyMs)}
              </span>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <Table className="text-xs">
                <TableHeader className="bg-secondary/70">
                  <TableRow className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                    <TableHead className="h-8 px-3">Shard</TableHead>
                    <TableHead className="h-8 px-2">State</TableHead>
                    <TableHead className="h-8 px-2">Admission</TableHead>
                    <TableHead className="h-8 px-2 text-right">
                      Durable Seq
                    </TableHead>
                    <TableHead className="h-8 px-2 text-right">
                      Progress Lag
                    </TableHead>
                    <TableHead className="h-8 px-2 text-right">
                      L0 / Compaction
                    </TableHead>
                    <TableHead className="h-8 px-2 text-right">
                      Unflushed
                    </TableHead>
                    <TableHead className="h-8 px-3 text-right">
                      Operations
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.shards.map((shard) => (
                    <TableRow
                      key={shard.id}
                      data-testid={`temporal-shard-row-${shard.id}`}
                    >
                      <TableCell className="px-3 py-2 font-mono font-semibold text-foreground">
                        shard/{shard.id}
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          gen {shard.generation}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-2">
                        <Badge
                          variant="outline"
                          className="text-[10.5px] capitalize"
                        >
                          {shard.lifecycle} · {shard.health}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 py-2 font-mono text-[11px]">
                        <span className="text-muted-foreground">ext:</span>{" "}
                        <AdmissionModeTag mode={shard.admissionMode.existing} />{" "}
                        <span className="text-muted-foreground">new:</span>{" "}
                        <AdmissionModeTag mode={shard.admissionMode.new} />{" "}
                        <span className="text-muted-foreground">batch:</span>{" "}
                        <AdmissionModeTag mode={shard.admissionMode.batch} />
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right font-mono tabular-nums">
                        {shard.durableSeq}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {shard.progressDelayMs.toFixed(2)}ms
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {shard.l0Ssts} L0 · {shard.compactionState}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {formatBytes(shard.unflushedBytes)}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            setHandoffError(null);
                            setHandoffShardId(shard.id);
                          }}
                        >
                          <ArrowRightLeft className="mr-1 size-3" />
                          Handoff
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Admission Control + Sampled Traces side-by-side on wide screens */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Admission Control */}
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <ShieldAlert className="size-4 text-muted-foreground" />
                  <span>Admission Control Overrides</span>
                </div>
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  PUT / DELETE /v1/admission
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[11px]">Traffic Class</Label>
                  <Select
                    value={admClass}
                    onValueChange={(v) =>
                      setAdmClass(v as "new" | "existing" | "batch" | "wait")
                    }
                  >
                    <SelectTrigger className="h-8 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new" className="font-mono text-xs">
                        new
                      </SelectItem>
                      <SelectItem
                        value="existing"
                        className="font-mono text-xs"
                      >
                        existing
                      </SelectItem>
                      <SelectItem value="batch" className="font-mono text-xs">
                        batch
                      </SelectItem>
                      <SelectItem value="wait" className="font-mono text-xs">
                        wait
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Mode</Label>
                  <Select
                    value={admMode}
                    onValueChange={(v) =>
                      setAdmMode(v === "closed" ? "closed" : "limit")
                    }
                  >
                    <SelectTrigger className="h-8 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="limit" className="font-mono text-xs">
                        limit
                      </SelectItem>
                      <SelectItem value="closed" className="font-mono text-xs">
                        closed
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="adm-rate" className="text-[11px]">
                    Rate / s
                  </Label>
                  <Input
                    id="adm-rate"
                    type="number"
                    disabled={admMode === "closed"}
                    value={admRate}
                    onChange={(e) => setAdmRate(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="adm-ttl" className="text-[11px]">
                    TTL (s, max 3600)
                  </Label>
                  <Input
                    id="adm-ttl"
                    type="number"
                    value={admTtl}
                    onChange={(e) => setAdmTtl(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={admMode === "closed" ? "destructive" : "default"}
                  className="h-7 text-xs"
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
                  className="h-7 text-xs"
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
                  <ShieldCheck className="mr-1 size-3" />
                  Lift Hold on {admClass}
                </Button>
              </div>
            </section>

            {/* Sampled Run Traces */}
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Activity className="size-4 text-muted-foreground" />
                  <span>
                    Sampled Run Traces ({tracesData?.traces.length ?? 0} /{" "}
                    {tracesData?.capacity ?? 4096})
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={
                    drainTraces.isPending ||
                    (tracesData?.traces.length ?? 0) === 0
                  }
                  onClick={() =>
                    void drainTraces
                      .mutateAsync()
                      .then((res) =>
                        toast.success(`Drained ${res.traces.length} traces`),
                      )
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : String(e)),
                      )
                  }
                >
                  <Trash2 className="mr-1 size-3" />
                  Drain Ring
                </Button>
              </div>

              {!tracesData || tracesData.traces.length === 0 ? (
                <p className="py-4 text-[11px] text-muted-foreground">
                  Trace ring buffer is empty (read with{" "}
                  <code className="font-mono">drain=false</code>). Enable trace
                  sampling on the server to inspect per-commit SlateDB write and
                  effect latency here.
                </p>
              ) : (
                <div className="max-h-48 divide-y divide-border overflow-y-auto rounded border border-border">
                  {tracesData.traces.slice(0, 20).map((trace, idx) => {
                    const wfId =
                      typeof trace.workflow_id === "string"
                        ? trace.workflow_id
                        : undefined;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 font-mono text-[11px]"
                      >
                        <span className="truncate text-foreground">
                          {wfId ?? JSON.stringify(trace).slice(0, 80)}
                        </span>
                        {wfId ? (
                          <button
                            type="button"
                            onClick={() => onOpenExecution(wfId)}
                            className="shrink-0 text-prism-cyan-600 hover:underline dark:text-prism-cyan-400"
                          >
                            Inspect
                          </button>
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

      {/* Shard Handoff Sheet */}
      <Sheet
        open={handoffShardId !== null}
        onOpenChange={(o) => !o && setHandoffShardId(null)}
      >
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle className="font-mono text-sm">
              Handoff shard/{handoffShardId}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Move shard ownership to another server in a placement-v2 cell
              (bumps generation by +1 and drains in-flight commits).
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-5 py-4 text-xs">
            {data?.info.placementVersion === 1 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
                This server is running in single-node placement-v1 mode. Shard
                handoff requires a multi-node placement-v2 cell.
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="handoff-target" className="text-xs">
                Target Server ID
              </Label>
              <Input
                id="handoff-target"
                value={handoffTarget}
                onChange={(e) => setHandoffTarget(e.target.value)}
                placeholder="e.g. cell-node-2"
                className="h-8 font-mono text-xs"
              />
            </div>
            {handoffError ? (
              <div className="rounded border border-destructive/40 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
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
              Execute Handoff
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <TemporalConfirmDialog
        confirmLabel={`Close "${admClass}" traffic`}
        description={`Closing admission class "${admClass}" for ${admTtl}s rejects incoming requests in that class until the TTL expires or you lift the hold.`}
        isPending={setAdmission.isPending}
        onConfirm={applyAdmissionHold}
        onOpenChange={setConfirmCloseOpen}
        open={confirmCloseOpen}
        title="Close admission traffic class?"
      />
    </div>
  );
}

function AdmissionModeTag(props: { mode: string }) {
  const { mode } = props;
  return (
    <span
      className={cn(
        "font-semibold",
        mode === "open"
          ? "text-foreground"
          : mode === "closed"
            ? "text-destructive"
            : "text-amber-700 dark:text-amber-300",
      )}
    >
      {mode}
    </span>
  );
}
