import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "@/ui/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/components/ui/tooltip";
import { cn } from "@/ui/lib/utils";

import type { StudioStreamDetails } from "../../../hooks/use-stream-details";

const INDEX_BUILD_SPAN_SEGMENTS = 16;

function formatBytes(sizeBytes: bigint | number): string {
  const numericValue =
    typeof sizeBytes === "bigint" ? Number(sizeBytes) : sizeBytes;

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = numericValue;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${Math.round(value)} ${units[unitIndex]}`;
  }

  const maximumFractionDigits = value < 10 ? 1 : 0;

  return `${value.toFixed(maximumFractionDigits)} ${units[unitIndex]}`;
}

function formatCount(value: bigint | number): string {
  return typeof value === "bigint"
    ? value.toLocaleString("en-US")
    : Math.max(0, Math.trunc(value)).toLocaleString("en-US");
}

function formatCapBytes(sizeBytes: bigint | number): string {
  const numericValue =
    typeof sizeBytes === "bigint" ? Number(sizeBytes) : sizeBytes;

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "0 B";
  }

  const gib = 1024 ** 3;
  const mib = 1024 ** 2;
  const kib = 1024;

  if (numericValue >= gib && numericValue % gib === 0) {
    return `${numericValue / gib} GiB`;
  }

  if (numericValue >= mib && numericValue % mib === 0) {
    return `${numericValue / mib} MiB`;
  }

  if (numericValue >= kib && numericValue % kib === 0) {
    return `${numericValue / kib} KiB`;
  }

  return formatBytes(numericValue);
}

function formatRelativeTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) {
    return "Unavailable";
  }

  const timestamp = Date.parse(isoTimestamp);

  if (Number.isNaN(timestamp)) {
    return "Unavailable";
  }

  const diffInSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [
    { limit: 60, unit: "second", value: diffInSeconds },
    { limit: 3600, unit: "minute", value: Math.round(diffInSeconds / 60) },
    { limit: 86_400, unit: "hour", value: Math.round(diffInSeconds / 3600) },
    { limit: 604_800, unit: "day", value: Math.round(diffInSeconds / 86_400) },
  ] as const;

  for (const candidate of units) {
    if (Math.abs(diffInSeconds) < candidate.limit) {
      return formatter.format(
        candidate.value,
        candidate.unit as Intl.RelativeTimeFormatUnit,
      );
    }
  }

  return formatter.format(Math.round(diffInSeconds / 2_629_746), "month");
}

function formatExactTimestamp(isoTimestamp: string | null): string {
  if (!isoTimestamp) {
    return "Unavailable";
  }

  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function formatLagDuration(lagMs: bigint | null): string {
  if (lagMs === null) {
    return "Unavailable";
  }

  if (lagMs <= 0n) {
    return "0 ms";
  }

  if (lagMs < 1_000n) {
    return `${formatCount(lagMs)} ms`;
  }

  const seconds = Number(lagMs) / 1_000;

  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  }

  const minutes = seconds / 60;

  if (minutes < 60) {
    return `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`;
  }

  const hours = minutes / 60;

  if (hours < 24) {
    return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  }

  const days = hours / 24;

  return `${days.toFixed(days < 10 ? 1 : 0)} d`;
}

function getUploadedSegmentCount(details: StudioStreamDetails): number {
  return (
    details.indexStatus?.segments.uploadedCount ?? details.uploadedSegmentCount
  );
}

function getTotalSegmentCount(details: StudioStreamDetails): number {
  return details.indexStatus?.segments.totalCount ?? details.segmentCount;
}

function getReadyForUploadSegmentCount(details: StudioStreamDetails): number {
  return Math.max(
    0,
    getTotalSegmentCount(details) - getUploadedSegmentCount(details),
  );
}

function isSegmentArtifact(artifact: string): boolean {
  const normalizedArtifact = artifact.trim().toLowerCase();

  return normalizedArtifact === "segment" || normalizedArtifact === "segments";
}

function getRoutingRunObjectCount(details: StudioStreamDetails): number {
  return (
    details.storage?.objectStorage.routingIndexObjectCount ??
    details.indexStatus?.routingKeyIndex?.objectCount ??
    0
  );
}

function getRoutingLexiconObjectCount(details: StudioStreamDetails): number {
  return (
    details.storage?.objectStorage.routingLexiconObjectCount ??
    details.indexStatus?.routingKeyLexicon?.objectCount ??
    0
  );
}

function getExactRunObjectCount(details: StudioStreamDetails): number {
  return (
    details.storage?.objectStorage.exactIndexObjectCount ??
    details.indexStatus?.exactIndexes.reduce(
      (sum, index) => sum + index.objectCount,
      0,
    ) ??
    0
  );
}

function getBundledCompanionObjectCount(details: StudioStreamDetails): number {
  return (
    details.storage?.objectStorage.bundledCompanionObjectCount ??
    details.indexStatus?.bundledCompanions.objectCount ??
    0
  );
}

function getRoutingRunBytes(details: StudioStreamDetails): bigint {
  return details.indexStatus?.routingKeyIndex?.bytesAtRest ?? 0n;
}

function getRoutingLexiconBytes(details: StudioStreamDetails): bigint {
  return details.indexStatus?.routingKeyLexicon?.bytesAtRest ?? 0n;
}

function getExactRunBytes(details: StudioStreamDetails): bigint {
  return (
    details.indexStatus?.exactIndexes.reduce(
      (sum, index) => sum + index.bytesAtRest,
      0n,
    ) ?? 0n
  );
}

function getBundledCompanionBytes(details: StudioStreamDetails): bigint {
  return (
    details.indexStatus?.bundledCompanions.bytesAtRest ??
    (details.storage?.companionFamilies.colBytes ?? 0n) +
      (details.storage?.companionFamilies.ftsBytes ?? 0n) +
      (details.storage?.companionFamilies.aggBytes ?? 0n) +
      (details.storage?.companionFamilies.mblkBytes ?? 0n)
  );
}

function getManifestObjectCount(details: StudioStreamDetails): number {
  const manifest = details.indexStatus?.manifest;

  if (!manifest) {
    return 0;
  }

  return manifest.uploadedGeneration > 0 ||
    manifest.generation > 0 ||
    manifest.lastUploadedAt != null ||
    manifest.lastUploadedEtag != null
    ? 1
    : 0;
}

function getProgressWidth(coveredSegments: number, uploadedSegments: number) {
  if (uploadedSegments <= 0 || coveredSegments <= 0) {
    return "0%";
  }

  return `${Math.min(100, (coveredSegments / uploadedSegments) * 100)}%`;
}

function formatMegabytes(sizeBytes: bigint): string {
  const megabyte = 1024n * 1024n;
  const scaledHundredths = (sizeBytes * 100n + megabyte / 2n) / megabyte;
  const whole = scaledHundredths / 100n;
  const fractional = (scaledHundredths % 100n).toString().padStart(2, "0");

  return `${whole}.${fractional} MB`;
}

function formatPercentTenths(percentTenths: bigint): string {
  const whole = percentTenths / 10n;
  const fractional = (percentTenths % 10n).toString();

  return `${whole}.${fractional}%`;
}

function getAverageSegmentSize(details: StudioStreamDetails): string {
  const segmentObjectCount =
    details.storage?.objectStorage.segmentObjectCount ?? 0;
  const segmentsBytes = details.storage?.objectStorage.segmentsBytes ?? 0n;

  if (segmentObjectCount <= 0 || segmentsBytes <= 0n) {
    return "Unavailable";
  }

  const segmentCountBigInt = BigInt(segmentObjectCount);
  const averageSegmentBytes =
    (segmentsBytes + segmentCountBigInt / 2n) / segmentCountBigInt;

  return formatMegabytes(averageSegmentBytes);
}

function getAverageSegmentCompression(details: StudioStreamDetails): string {
  const segmentObjectCount =
    details.storage?.objectStorage.segmentObjectCount ?? 0;
  const segmentsBytes = details.storage?.objectStorage.segmentsBytes ?? 0n;
  const logicalBytes = details.totalSizeBytes;

  if (segmentObjectCount <= 0 || segmentsBytes <= 0n || logicalBytes <= 0n) {
    return "Unavailable";
  }

  const savedBytes = logicalBytes - segmentsBytes;

  if (savedBytes <= 0n) {
    return "0.0%";
  }

  const compressionPercentTenths = (savedBytes * 1000n) / logicalBytes;
  const clampedCompressionPercentTenths =
    compressionPercentTenths > 1000n ? 1000n : compressionPercentTenths;

  return formatPercentTenths(clampedCompressionPercentTenths);
}

interface RunAcceleratorItem {
  bytesAtRest: bigint;
  indexedSegmentCount: number;
  kindLabel: string;
  lagMs: bigint | null;
  lagSegments: number;
  name: string;
  objectCount: number;
  updatedAt: string | null;
}

interface SearchCoverageItem {
  bytesAtRest: bigint;
  contiguousCoveredSegmentCount: number;
  coveredSegmentCount: number;
  family: string;
  fields: string[];
  lagMs: bigint | null;
  lagSegments: number;
  objectCount: number;
  staleSegmentCount: number;
  updatedAt: string | null;
}

function createRunAcceleratorItems(
  details: StudioStreamDetails,
): RunAcceleratorItem[] {
  const items: RunAcceleratorItem[] = [];

  if (details.indexStatus?.routingKeyIndex?.configured) {
    const routing = details.indexStatus.routingKeyIndex;

    items.push({
      bytesAtRest: routing.bytesAtRest,
      indexedSegmentCount: routing.indexedSegmentCount,
      kindLabel: "Routing run index",
      lagMs: routing.lagMs,
      lagSegments: routing.lagSegments,
      name: "routing key",
      objectCount: routing.objectCount,
      updatedAt: routing.updatedAt,
    });
  }

  if (details.indexStatus?.routingKeyLexicon?.configured) {
    const lexicon = details.indexStatus.routingKeyLexicon;

    items.push({
      bytesAtRest: lexicon.bytesAtRest,
      indexedSegmentCount: lexicon.indexedSegmentCount,
      kindLabel: "Routing key lexicographic index",
      lagMs: lexicon.lagMs,
      lagSegments: lexicon.lagSegments,
      name: "routing key lexicon",
      objectCount: lexicon.objectCount,
      updatedAt: lexicon.updatedAt,
    });
  }

  for (const exactIndex of details.indexStatus?.exactIndexes ?? []) {
    items.push({
      bytesAtRest: exactIndex.bytesAtRest,
      indexedSegmentCount: exactIndex.indexedSegmentCount,
      kindLabel: `Exact run index (${exactIndex.kind})`,
      lagMs: exactIndex.lagMs,
      lagSegments: exactIndex.lagSegments,
      name: exactIndex.name,
      objectCount: exactIndex.objectCount,
      updatedAt: exactIndex.updatedAt,
    });
  }

  return items.sort((left, right) => left.name.localeCompare(right.name));
}

function createSearchCoverageItems(
  details: StudioStreamDetails,
): SearchCoverageItem[] {
  return [...(details.indexStatus?.searchFamilies ?? [])]
    .map((family) => ({
      bytesAtRest: family.bytesAtRest,
      contiguousCoveredSegmentCount: family.contiguousCoveredSegmentCount,
      coveredSegmentCount: family.coveredSegmentCount,
      family: family.family,
      fields: family.fields,
      lagMs: family.lagMs,
      lagSegments: family.lagSegments,
      objectCount: family.objectCount,
      staleSegmentCount: family.staleSegmentCount,
      updatedAt: family.updatedAt,
    }))
    .sort((left, right) => left.family.localeCompare(right.family));
}

function getRunAcceleratorState(item: RunAcceleratorItem): {
  description: string;
  label: string;
} {
  if (item.lagSegments === 0) {
    return {
      description: "No uncovered uploaded segments remain for this run index.",
      label: "Caught up",
    };
  }

  if (item.lagSegments < INDEX_BUILD_SPAN_SEGMENTS) {
    const nextBuildAt = item.indexedSegmentCount + INDEX_BUILD_SPAN_SEGMENTS;
    const lagDescription =
      item.lagMs === null
        ? ""
        : ` Current lag is ${formatLagDuration(item.lagMs)}.`;

    return {
      description: `Next build at ${formatCount(nextBuildAt)} uploaded segments.${lagDescription}`,
      label: "Waiting for next full 16-segment span",
    };
  }

  return {
    description:
      item.lagMs === null
        ? `${formatCount(item.lagSegments)} uploaded segments behind the head.`
        : `${formatCount(item.lagSegments)} uploaded segments and ${formatLagDuration(item.lagMs)} behind the head.`,
    label: "Backfilling",
  };
}

function getSearchCoverageState(item: SearchCoverageItem): {
  description: string;
  label: string;
} {
  if (item.lagSegments === 0 && item.staleSegmentCount === 0) {
    return {
      description: "Contiguous bundled coverage reaches the uploaded head.",
      label: "Caught up",
    };
  }

  if (item.contiguousCoveredSegmentCount < item.coveredSegmentCount) {
    return {
      description: `${formatCount(item.contiguousCoveredSegmentCount)} contiguous segments are covered; ${formatCount(item.coveredSegmentCount)} segments have bundles in total.`,
      label: "Partial contiguous coverage",
    };
  }

  return {
    description:
      item.lagMs === null
        ? `${formatCount(item.lagSegments)} segments behind the uploaded head.`
        : `${formatCount(item.lagSegments)} segments and ${formatLagDuration(item.lagMs)} behind the uploaded head.`,
    label: "Catching up",
  };
}

function getLagMetric(lagMs: bigint | null): string | null {
  if (lagMs === null) {
    return null;
  }

  return `${formatLagDuration(lagMs)} behind`;
}

function MetricRow(props: {
  description: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {props.label}
      </div>
      <div className="text-sm font-semibold text-foreground">{props.value}</div>
      <div className="text-xs leading-5 text-muted-foreground">
        {props.description}
      </div>
    </div>
  );
}

function DiagnosticsSection(props: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {props.title}
        </h3>
        {props.description ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {props.description}
          </p>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

const LEDGER_COLUMNS_CLASS =
  "grid-cols-[minmax(0,1fr)_minmax(0,7rem)_minmax(0,11rem)]";
const SHARED_SERVER_CAP_TOOLTIP =
  "This is a server cap, shared by all streams.";

function SharedCapAnnotation(props: { value: bigint | null | undefined }) {
  if (props.value == null || props.value <= 0n) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block cursor-default text-[11px] leading-5 text-muted-foreground/80">
          ({formatCapBytes(props.value)} cap)
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-balance">
        {SHARED_SERVER_CAP_TOOLTIP}
      </TooltipContent>
    </Tooltip>
  );
}

function LedgerRow(props: {
  annotation?: ReactNode;
  label: string;
  subRows?: Array<{ label: string; value: string }>;
  tooltip?: string;
  total?: boolean;
  value: string;
}) {
  const labelNode = props.tooltip ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block cursor-default text-sm text-muted-foreground">
          {props.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-balance">
        {props.tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <span className="text-sm text-muted-foreground">{props.label}</span>
  );

  return (
    <div
      className={cn(
        "grid items-baseline gap-x-3 gap-y-1 px-3 py-2",
        LEDGER_COLUMNS_CLASS,
        props.total
          ? "border-t border-border/70 text-foreground"
          : "text-muted-foreground",
      )}
    >
      <div className={cn("min-w-0", props.total ? "font-medium" : undefined)}>
        {labelNode}
        {props.subRows && props.subRows.length > 0 ? (
          <div className="mt-1 grid gap-0.5 text-xs font-normal leading-5 text-muted-foreground">
            {props.subRows.map((subRow) => (
              <div key={subRow.label} className="flex items-baseline gap-1">
                <span>{subRow.label}</span>
                <span className="tabular-nums">{subRow.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="text-right text-sm tabular-nums">
        {props.total ? null : props.value}
      </div>
      <div
        className={cn(
          "text-sm tabular-nums",
          props.total
            ? "text-right font-semibold text-foreground"
            : "text-left text-muted-foreground",
        )}
      >
        {props.total ? props.value : (props.annotation ?? null)}
      </div>
    </div>
  );
}

function LedgerSection(props: {
  children: ReactNode;
  testId: string;
  title: string;
  total: string;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div
      className="overflow-hidden rounded-lg border border-border/60 bg-background/60"
      data-state={isOpen ? "open" : "closed"}
      data-testid={props.testId}
    >
      <button
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
        data-testid={`${props.testId}-toggle`}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <div className="min-w-0 flex-1 text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
          {props.title}
        </div>
        {!isOpen ? (
          <div className="text-right text-sm font-semibold tabular-nums text-foreground">
            {props.total}
          </div>
        ) : null}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            isOpen ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden border-t border-border/50">
          {props.children}
        </div>
      </div>
    </div>
  );
}

function CoverageRow(props: {
  description: string;
  metrics: Array<string | null>;
  progressLabel: string;
  progressWidth: string;
  stateLabel: string;
  subtitle: string;
  title: string;
  updatedAt: string | null;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {props.title}
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            {props.subtitle}
          </div>
        </div>
        <Badge variant="secondary">{props.stateLabel}</Badge>
      </div>

      <div className="mt-2 text-xs leading-5 text-muted-foreground">
        {props.description}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          aria-hidden="true"
          className="h-full rounded-full bg-foreground/80 transition-[width] duration-200 ease-out"
          style={{ width: props.progressWidth }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
        <span>{props.progressLabel}</span>
        {props.metrics
          .filter((metric): metric is string => metric !== null)
          .map((metric) => (
            <span key={metric}>{metric}</span>
          ))}
        {props.updatedAt ? (
          <span title={formatExactTimestamp(props.updatedAt)}>
            Updated {formatRelativeTime(props.updatedAt)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard(props: {
  children: ReactNode;
  title: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="shadow-none">
          <CardHeader className="grid gap-2 p-4">
            <CardDescription>{props.title}</CardDescription>
            {props.children}
          </CardHeader>
        </Card>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-balance">
        {props.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function StreamDiagnosticsPopover(props: {
  details: StudioStreamDetails;
}) {
  const { details } = props;
  const uploadedSegments = getUploadedSegmentCount(details);
  const localRetainedStreamBytes =
    (details.storage?.localStorage.walRetainedBytes ?? 0n) +
    (details.storage?.localStorage.pendingSealedSegmentBytes ?? 0n);
  const localCacheBytes =
    (details.storage?.localStorage.segmentCacheBytes ?? 0n) +
    (details.storage?.localStorage.routingIndexCacheBytes ?? 0n) +
    (details.storage?.localStorage.lexiconIndexCacheBytes ?? 0n) +
    (details.storage?.localStorage.exactIndexCacheBytes ?? 0n) +
    (details.storage?.localStorage.companionCacheBytes ?? 0n);
  const routingRunBytes = getRoutingRunBytes(details);
  const routingLexiconBytes = getRoutingLexiconBytes(details);
  const exactRunBytes = getExactRunBytes(details);
  const bundledCompanionBytes = getBundledCompanionBytes(details);
  const routingRunObjectCount = getRoutingRunObjectCount(details);
  const routingLexiconObjectCount = getRoutingLexiconObjectCount(details);
  const exactRunObjectCount = getExactRunObjectCount(details);
  const bundledCompanionObjectCount = getBundledCompanionObjectCount(details);
  const runAcceleratorItems = createRunAcceleratorItems(details);
  const searchCoverageItems = createSearchCoverageItems(details);
  const requestBreakdowns = details.objectStoreRequests?.byArtifact ?? [];
  const requestTotal =
    (details.objectStoreRequests?.puts ?? 0n) +
    (details.objectStoreRequests?.reads ?? 0n);
  const readyForUploadSegmentCount = getReadyForUploadSegmentCount(details);
  const averageSegmentSize = getAverageSegmentSize(details);
  const averageSegmentCompression = getAverageSegmentCompression(details);
  const hasRoutingLexiconDiagnostics =
    details.indexStatus?.routingKeyLexicon?.configured === true ||
    routingLexiconBytes > 0n ||
    routingLexiconObjectCount > 0 ||
    (details.storage?.localStorage.lexiconIndexCacheBytes ?? 0n) > 0n;

  return (
    <div
      className="grid max-h-[70vh] gap-4 overflow-y-auto p-4 font-sans"
      data-testid="stream-diagnostics-popover"
    >
      <div className="grid gap-1">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Stream diagnostics
        </div>
      </div>

      <TooltipProvider>
        <div className="grid gap-3 md:grid-cols-2">
          <SummaryCard
            title="Data ingested"
            tooltip="Size of data ingested, before compression and not counting indexes."
          >
            <CardTitle className="text-xl">
              {formatBytes(details.totalSizeBytes)}
            </CardTitle>
          </SummaryCard>

          <SummaryCard
            title="Object-store requests"
            tooltip={`${formatCount(details.objectStoreRequests?.puts ?? 0n)} puts and ${formatCount(details.objectStoreRequests?.reads ?? 0n)} reads observed by this server process for this stream.`}
          >
            <div className="flex items-center gap-4 text-xl font-semibold tabular-nums text-foreground">
              <div className="inline-flex items-center gap-1.5">
                <ArrowUp size={16} className="text-muted-foreground" />
                <span>
                  {formatCount(details.objectStoreRequests?.puts ?? 0n)}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5">
                <ArrowDown size={16} className="text-muted-foreground" />
                <span>
                  {formatCount(details.objectStoreRequests?.reads ?? 0n)}
                </span>
              </div>
            </div>
          </SummaryCard>
        </div>
      </TooltipProvider>

      <TooltipProvider>
        <LedgerSection
          testId="stream-diagnostics-object-storage"
          title="Object storage"
          total={formatBytes(details.storage?.objectStorage.totalBytes ?? 0n)}
        >
          <TooltipProvider>
            <div className="grid">
              <LedgerRow
                label="Segment index files"
                tooltip={`${formatCount(bundledCompanionObjectCount)} companion objects across bundled search families.`}
                value={formatBytes(bundledCompanionBytes)}
              />
              <LedgerRow
                label="Exact runs"
                tooltip={`${formatCount(exactRunObjectCount)} exact run objects currently at rest.`}
                value={formatBytes(exactRunBytes)}
              />
              <LedgerRow
                label="Routing runs"
                tooltip={`${formatCount(routingRunObjectCount)} routing run objects currently at rest.`}
                value={formatBytes(routingRunBytes)}
              />
              {hasRoutingLexiconDiagnostics ? (
                <LedgerRow
                  label="Routing key lexicon"
                  tooltip={`${formatCount(routingLexiconObjectCount)} routing-key lexicon objects currently at rest.`}
                  value={formatBytes(routingLexiconBytes)}
                />
              ) : null}
              <LedgerRow
                label="Indexes total"
                tooltip={`${formatCount(bundledCompanionObjectCount)} companion objects + ${formatCount(exactRunObjectCount)} exact run objects + ${formatCount(routingRunObjectCount)} routing run objects + ${formatCount(routingLexiconObjectCount)} routing-key lexicon objects.`}
                total
                value={formatBytes(
                  details.storage?.objectStorage.indexesBytes ?? 0n,
                )}
              />
              <LedgerRow
                label="Manifest"
                tooltip={`${formatCount(getManifestObjectCount(details))} manifest object visible.`}
                value={formatBytes(
                  details.storage?.objectStorage.manifestBytes ?? 0n,
                )}
              />
              <LedgerRow
                label="Schema"
                tooltip="Schema registry and related uploaded metadata."
                value={formatBytes(
                  details.storage?.objectStorage.schemaRegistryBytes ?? 0n,
                )}
              />
              <LedgerRow
                label="Metadata total"
                tooltip="Manifest plus schema metadata stored in object storage."
                total
                value={formatBytes(
                  details.storage?.objectStorage.manifestAndMetaBytes ?? 0n,
                )}
              />
              <LedgerRow
                label="Segment data"
                subRows={[
                  {
                    label: "Average segment size",
                    value: averageSegmentSize,
                  },
                  {
                    label: "Average segment compression",
                    value: averageSegmentCompression,
                  },
                ]}
                tooltip={`${formatCount(details.storage?.objectStorage.segmentObjectCount ?? 0)} uploaded segment objects.`}
                total
                value={formatBytes(
                  details.storage?.objectStorage.segmentsBytes ?? 0n,
                )}
              />
              <div
                className={cn(
                  "grid items-baseline gap-x-3 gap-y-1 border-t-2 border-foreground/20 bg-muted/20 px-3 py-2.5",
                  LEDGER_COLUMNS_CLASS,
                )}
              >
                <div className="text-sm font-medium text-foreground">Total</div>
                <div />
                <div className="text-right text-sm font-semibold tabular-nums text-foreground">
                  {formatBytes(details.storage?.objectStorage.totalBytes ?? 0n)}
                </div>
              </div>
            </div>
          </TooltipProvider>
        </LedgerSection>
      </TooltipProvider>

      <TooltipProvider>
        <LedgerSection
          testId="stream-diagnostics-local-storage"
          title="Local storage"
          total={formatBytes(details.storage?.localStorage.totalBytes ?? 0n)}
        >
          <TooltipProvider>
            <div className="grid">
              <LedgerRow
                label="Retained WAL"
                tooltip="All WAL bytes still retained by the node for this stream. The pending tail below is included in this number."
                value={formatBytes(
                  details.storage?.localStorage.walRetainedBytes ?? 0n,
                )}
              />
              <LedgerRow
                label="Pending tail"
                tooltip={`${formatCount(details.pendingRows)} pending rows are still in the unsealed live tail. This is included in Retained WAL and is not added on top.`}
                value={formatBytes(
                  details.storage?.localStorage.pendingTailBytes ?? 0n,
                )}
              />
              <LedgerRow
                label="Pending sealed segments"
                tooltip="Sealed segment bytes still retained locally because they have not been uploaded or reclaimed yet."
                value={formatBytes(
                  details.storage?.localStorage.pendingSealedSegmentBytes ?? 0n,
                )}
              />
              <LedgerRow
                label="Retained stream data"
                tooltip="Retained WAL plus pending sealed segment bytes. Pending tail is already included inside Retained WAL."
                total
                value={formatBytes(localRetainedStreamBytes)}
              />
              <LedgerRow
                label="Segment cache"
                tooltip="Locally cached segment data."
                annotation={
                  <SharedCapAnnotation
                    value={
                      details.serverConfiguredLimits?.caches.segmentCacheBytes
                    }
                  />
                }
                value={formatBytes(
                  details.storage?.localStorage.segmentCacheBytes ?? 0n,
                )}
              />
              <div className="relative">
                <LedgerRow
                  label="Routing cache"
                  tooltip="Locally cached routing index state."
                  value={formatBytes(
                    details.storage?.localStorage.routingIndexCacheBytes ?? 0n,
                  )}
                />
                {hasRoutingLexiconDiagnostics ? (
                  <LedgerRow
                    label="Routing lexicon cache"
                    tooltip="Locally cached routing-key lexicon state used for alphabetical key listing."
                    value={formatBytes(
                      details.storage?.localStorage.lexiconIndexCacheBytes ??
                        0n,
                    )}
                  />
                ) : null}
                <LedgerRow
                  label="Exact cache"
                  tooltip="Locally cached exact-index state."
                  value={formatBytes(
                    details.storage?.localStorage.exactIndexCacheBytes ?? 0n,
                  )}
                />
                {details.serverConfiguredLimits?.caches
                  .indexRunDiskCacheBytes ? (
                  <div className="pointer-events-none absolute bottom-2.5 right-3 top-2.5 flex w-[11rem] items-center gap-1.5">
                    <div className="my-1 h-auto self-stretch w-px bg-border/70" />
                    <div className="pointer-events-auto flex min-w-0 items-center">
                      <SharedCapAnnotation
                        value={
                          details.serverConfiguredLimits.caches
                            .indexRunDiskCacheBytes
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <LedgerRow
                label="Companion cache"
                tooltip="Locally cached bundled companion state used to accelerate search-family coverage."
                annotation={
                  <SharedCapAnnotation
                    value={
                      details.serverConfiguredLimits?.caches
                        .companionFileCacheBytes
                    }
                  />
                }
                value={formatBytes(
                  details.storage?.localStorage.companionCacheBytes ?? 0n,
                )}
              />
              <LedgerRow
                label="Caches total"
                tooltip="Segment, routing, routing-key lexicon, exact-index, and companion cache bytes combined."
                total
                value={formatBytes(localCacheBytes)}
              />
              <div
                className={cn(
                  "grid items-baseline gap-x-3 gap-y-1 border-t-2 border-foreground/20 bg-muted/20 px-3 py-2.5",
                  LEDGER_COLUMNS_CLASS,
                )}
              >
                <div className="text-sm font-medium text-foreground">Total</div>
                <div />
                <div className="text-right text-sm font-semibold tabular-nums text-foreground">
                  {formatBytes(details.storage?.localStorage.totalBytes ?? 0n)}
                </div>
              </div>
            </div>
          </TooltipProvider>
        </LedgerSection>
      </TooltipProvider>

      <DiagnosticsSection
        description="Bundled companion families determine whether search and aggregate queries are fully accelerated across uploaded history."
        title="Search coverage"
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricRow
            description={`${formatCount(bundledCompanionObjectCount)} bundled companion objects split by family.`}
            label="Bundled companions"
            value={formatBytes(bundledCompanionBytes)}
          />
          <MetricRow
            description={`Column family storage.`}
            label="COL"
            value={formatBytes(
              details.storage?.companionFamilies.colBytes ?? 0n,
            )}
          />
          <MetricRow
            description={`Full-text family storage.`}
            label="FTS"
            value={formatBytes(
              details.storage?.companionFamilies.ftsBytes ?? 0n,
            )}
          />
          <MetricRow
            description={`Aggregate and metric-block sections.`}
            label="AGG + MBLK"
            value={formatBytes(
              (details.storage?.companionFamilies.aggBytes ?? 0n) +
                (details.storage?.companionFamilies.mblkBytes ?? 0n),
            )}
          />
        </div>

        {searchCoverageItems.length > 0 ? (
          <div className="grid gap-2">
            {searchCoverageItems.map((item) => {
              const state = getSearchCoverageState(item);

              return (
                <CoverageRow
                  key={item.family}
                  description={state.description}
                  metrics={[
                    `${formatBytes(item.bytesAtRest)} at rest`,
                    `${formatCount(item.objectCount)} objects`,
                    getLagMetric(item.lagMs),
                  ]}
                  progressLabel={`${formatCount(item.contiguousCoveredSegmentCount)} contiguous / ${formatCount(uploadedSegments)} uploaded segments`}
                  progressWidth={getProgressWidth(
                    item.contiguousCoveredSegmentCount,
                    uploadedSegments,
                  )}
                  stateLabel={state.label}
                  subtitle={
                    item.fields.length > 0
                      ? item.fields.join(", ")
                      : "No explicit fields"
                  }
                  title={item.family}
                  updatedAt={item.updatedAt}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            This stream does not currently advertise bundled search-family
            coverage.
          </div>
        )}
      </DiagnosticsSection>

      <DiagnosticsSection
        description="Run accelerators cover historical cross-segment pruning. They build in fixed 16-segment spans, so a small uncovered tail can be healthy. Detecting truly falling-behind or stalled behavior requires lag-trend metrics over time."
        title="Run accelerators"
      >
        {runAcceleratorItems.length > 0 ? (
          <div className="grid gap-2">
            {runAcceleratorItems.map((item) => {
              const state = getRunAcceleratorState(item);

              return (
                <CoverageRow
                  key={`${item.kindLabel}:${item.name}`}
                  description={state.description}
                  metrics={[
                    `${formatBytes(item.bytesAtRest)} at rest`,
                    `${formatCount(item.objectCount)} objects`,
                    getLagMetric(item.lagMs),
                  ]}
                  progressLabel={`${formatCount(item.indexedSegmentCount)} / ${formatCount(uploadedSegments)} uploaded segments`}
                  progressWidth={getProgressWidth(
                    item.indexedSegmentCount,
                    uploadedSegments,
                  )}
                  stateLabel={state.label}
                  subtitle={item.kindLabel}
                  title={item.name}
                  updatedAt={item.updatedAt}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            This stream does not currently advertise run-accelerator progress.
          </div>
        )}
      </DiagnosticsSection>

      <TooltipProvider>
        <LedgerSection
          testId="stream-diagnostics-request-accounting"
          title="Request accounting"
          total={`${formatCount(requestTotal)} requests`}
        >
          <TooltipProvider>
            <div className="grid">
              <LedgerRow
                label="GET"
                tooltip="Node-local object fetches recorded by the current Streams process."
                value={formatCount(details.objectStoreRequests?.gets ?? 0n)}
              />
              <LedgerRow
                label="HEAD"
                tooltip="Node-local object metadata probes recorded by the current Streams process."
                value={formatCount(details.objectStoreRequests?.heads ?? 0n)}
              />
              <LedgerRow
                label="LIST"
                tooltip="Node-local object listing requests recorded by the current Streams process."
                value={formatCount(details.objectStoreRequests?.lists ?? 0n)}
              />
              <LedgerRow
                label="Reads total"
                tooltip="GET + HEAD + LIST read-side requests recorded by this Streams process."
                total
                value={formatCount(details.objectStoreRequests?.reads ?? 0n)}
              />
              <LedgerRow
                label="Puts total"
                tooltip="Write-side object-store requests recorded by this Streams process."
                total
                value={formatCount(details.objectStoreRequests?.puts ?? 0n)}
              />
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)_minmax(0,7rem)] items-baseline gap-x-3 gap-y-1 border-t-2 border-foreground/20 bg-muted/20 px-3 py-2.5">
                <div className="text-sm font-medium text-foreground">
                  Requests total
                </div>
                <div />
                <div className="text-right text-sm font-semibold tabular-nums text-foreground">
                  {formatCount(requestTotal)}
                </div>
              </div>

              {requestBreakdowns.length > 0 ? (
                <div className="border-t border-border/50">
                  <div className="border-b border-border/60 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    By artifact
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem_4.5rem] gap-3 border-b border-border/40 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    <div>Artifact</div>
                    <div className="text-right">Puts</div>
                    <div className="text-right">Gets</div>
                    <div className="text-right">Heads</div>
                    <div className="text-right">Lists</div>
                  </div>
                  <div className="grid">
                    {requestBreakdowns.map((entry) => (
                      <div
                        key={entry.artifact}
                        className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem_4.5rem] gap-3 border-t border-border/40 px-3 py-2 text-sm first:border-t-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-normal text-muted-foreground">
                            {entry.artifact}
                          </div>
                          {isSegmentArtifact(entry.artifact) ? (
                            <div className="text-xs leading-5 text-muted-foreground">
                              Ready for upload{" "}
                              {formatCount(readyForUploadSegmentCount)}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right tabular-nums text-foreground">
                          {formatCount(entry.puts)}
                        </div>
                        <div className="text-right tabular-nums text-foreground">
                          {formatCount(entry.gets)}
                        </div>
                        <div className="text-right tabular-nums text-foreground">
                          {formatCount(entry.heads)}
                        </div>
                        <div className="text-right tabular-nums text-foreground">
                          {formatCount(entry.lists)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border-t border-border/50 px-3 py-3 text-sm text-muted-foreground">
                  Per-artifact request counters are not available from this
                  server build yet.
                </div>
              )}
            </div>
          </TooltipProvider>
        </LedgerSection>
      </TooltipProvider>
    </div>
  );
}
