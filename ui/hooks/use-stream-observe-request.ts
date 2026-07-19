import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useStudio } from "../studio/context";
import type { StudioStreamObservability } from "./use-streams";

export const STREAM_PROFILE_EVLOG = "evlog";
export const STREAM_PROFILE_OTEL_TRACES = "otel-traces";

const OBSERVE_EVENTS_LIMIT = 50;
const OBSERVE_SPANS_LIMIT = 2000;

const OBSERVE_PARAM_PREFIXES = {
  requestId: "req",
  spanId: "span",
  traceId: "trace",
} as const;

export type StudioObserveLookupKind = keyof typeof OBSERVE_PARAM_PREFIXES;

export interface StudioObserveLookup {
  kind: StudioObserveLookupKind;
  value: string;
}

export interface StudioObserveSummary {
  duration: number | null;
  endTime: string | null;
  environment: string | null;
  errorFix: string | null;
  errorLink: string | null;
  errorMessage: string | null;
  errorWhy: string | null;
  isError: boolean;
  level: string | null;
  method: string | null;
  path: string | null;
  route: string | null;
  service: string | null;
  startTime: string | null;
  status: number | null;
  title: string;
}

export interface StudioObserveEvlogEvent {
  duration: number | null;
  fix: string | null;
  level: string | null;
  link: string | null;
  message: string | null;
  method: string | null;
  path: string | null;
  raw: unknown;
  requestId: string | null;
  service: string | null;
  spanId: string | null;
  status: number | null;
  timestamp: string | null;
  traceId: string | null;
  why: string | null;
}

export interface StudioObserveEvlog {
  matchCount: number;
  primary: StudioObserveEvlogEvent | null;
  stream: string;
}

export interface StudioObserveTraceTreeNode {
  children: StudioObserveTraceTreeNode[];
  depth: number;
  duration: number | null;
  endTime: string | null;
  kind: string;
  name: string;
  parentSpanId: string | null;
  service: string | null;
  spanId: string;
  startTime: string;
  statusCode: string;
}

export interface StudioObserveTraceError {
  message: string | null;
  name: string;
  service: string | null;
  spanId: string;
  time: string | null;
  type: string | null;
}

export interface StudioObserveServiceEdge {
  count: number;
  errorCount: number;
  from: string;
  to: string;
}

export interface StudioObserveTrace {
  criticalPath: string[];
  duplicateSpans: number;
  errors: StudioObserveTraceError[];
  missingParents: string[];
  partial: boolean;
  rootSpanId: string | null;
  serviceMap: StudioObserveServiceEdge[];
  spanCount: number;
  spansById: Map<string, unknown>;
  stream: string;
  traceId: string | null;
  tree: StudioObserveTraceTreeNode[];
}

export interface StudioObserveTimelineItem {
  duration: number | null;
  id: string;
  kind: string;
  service: string | null;
  severity: string;
  sourceProfile: string | null;
  sourceStream: string | null;
  spanId: string | null;
  time: string;
  title: string;
}

export interface StudioObserveCoverageSide {
  complete: boolean;
  hits: number;
  limitReached: boolean;
  searched: boolean;
  timedOut: boolean;
}

export interface StudioObserveCoverage {
  events: StudioObserveCoverageSide | null;
  traces: StudioObserveCoverageSide | null;
  warnings: string[];
}

export interface StudioObserveRequestResult {
  coverage: StudioObserveCoverage;
  evlog: StudioObserveEvlog | null;
  lookup: {
    requestId: string | null;
    spanId: string | null;
    traceId: string | null;
  };
  summary: StudioObserveSummary;
  timeline: StudioObserveTimelineItem[];
  trace: StudioObserveTrace | null;
}

export interface UseStreamObserveRequestArgs {
  eventsStream: string | null;
  lookup: StudioObserveLookup | null;
  tracesStream: string | null;
}

export function serializeStreamObserveParam(
  lookup: StudioObserveLookup,
): string {
  return `${OBSERVE_PARAM_PREFIXES[lookup.kind]}:${lookup.value}`;
}

export function parseStreamObserveParam(
  value: string | null | undefined,
): StudioObserveLookup | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const separatorIndex = trimmed.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null;
  }

  const prefix = trimmed.slice(0, separatorIndex).toLowerCase();
  const lookupValue = trimmed.slice(separatorIndex + 1).trim();

  if (!lookupValue) {
    return null;
  }

  for (const [kind, candidatePrefix] of Object.entries(
    OBSERVE_PARAM_PREFIXES,
  )) {
    if (candidatePrefix === prefix) {
      return {
        kind: kind as StudioObserveLookupKind,
        value: lookupValue,
      };
    }
  }

  return null;
}

export function isObservabilityStreamProfile(
  profile: string | null | undefined,
): profile is typeof STREAM_PROFILE_EVLOG | typeof STREAM_PROFILE_OTEL_TRACES {
  return (
    profile === STREAM_PROFILE_EVLOG || profile === STREAM_PROFILE_OTEL_TRACES
  );
}

export function resolveObserveStreams(args: {
  activeStreamName: string;
  activeStreamProfile: string | null | undefined;
  observability: StudioStreamObservability | null | undefined;
}): {
  eventsStream: string | null;
  tracesStream: string | null;
} {
  const { activeStreamName, activeStreamProfile, observability } = args;
  const requestPair = observability?.request ?? null;

  if (activeStreamProfile === STREAM_PROFILE_EVLOG) {
    return {
      eventsStream: activeStreamName,
      tracesStream: requestPair?.tracesStream ?? null,
    };
  }

  if (activeStreamProfile === STREAM_PROFILE_OTEL_TRACES) {
    return {
      eventsStream: requestPair?.eventsStream ?? null,
      tracesStream: activeStreamName,
    };
  }

  return {
    eventsStream: null,
    tracesStream: null,
  };
}

export interface StreamEventObserveIds {
  requestId: string | null;
  spanId: string | null;
  traceId: string | null;
}

export function getObserveLookupForStreamEvent(args: {
  body: unknown;
  profile: string | null | undefined;
}): {
  ids: StreamEventObserveIds;
  lookup: StudioObserveLookup | null;
} {
  const ids: StreamEventObserveIds = {
    requestId: null,
    spanId: null,
    traceId: null,
  };

  if (
    !isObservabilityStreamProfile(args.profile) ||
    typeof args.body !== "object" ||
    args.body === null
  ) {
    return { ids, lookup: null };
  }

  const body = args.body as Record<string, unknown>;

  ids.requestId = parseNullableString(body.requestId);
  ids.spanId = parseNullableString(body.spanId);
  ids.traceId = parseNullableString(body.traceId);

  if (args.profile === STREAM_PROFILE_EVLOG) {
    if (ids.requestId) {
      return { ids, lookup: { kind: "requestId", value: ids.requestId } };
    }

    if (ids.traceId) {
      return { ids, lookup: { kind: "traceId", value: ids.traceId } };
    }

    return { ids, lookup: null };
  }

  if (ids.traceId) {
    return { ids, lookup: { kind: "traceId", value: ids.traceId } };
  }

  if (ids.spanId) {
    return { ids, lookup: { kind: "spanId", value: ids.spanId } };
  }

  return { ids, lookup: null };
}

function parseNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function createObserveRequestUrl(streamsUrl: string | undefined): string {
  const trimmedStreamsUrl = streamsUrl?.trim();

  if (!trimmedStreamsUrl) {
    return "";
  }

  const suffix = "/v1/observe/request";

  try {
    const url = new URL(trimmedStreamsUrl);
    const pathname = url.pathname.replace(/\/+$/, "");

    url.pathname = `${pathname}${suffix}`;
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    const pathname = trimmedStreamsUrl
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");

    return `${pathname}${suffix}`;
  }
}

function normalizeSummary(value: unknown): StudioObserveSummary {
  const summary = parseRecord(value) ?? {};
  const error = parseRecord(summary.error) ?? {};

  return {
    duration: parseNullableNumber(summary.duration),
    endTime: parseNullableString(summary.endTime),
    environment: parseNullableString(summary.environment),
    errorFix: parseNullableString(error.fix),
    errorLink: parseNullableString(error.link),
    errorMessage: parseNullableString(error.message),
    errorWhy: parseNullableString(error.why),
    isError: error.isError === true,
    level: parseNullableString(summary.level),
    method: parseNullableString(summary.method),
    path: parseNullableString(summary.path),
    route: parseNullableString(summary.route),
    service: parseNullableString(summary.service),
    startTime: parseNullableString(summary.startTime),
    status: parseNullableNumber(summary.status),
    title: parseNullableString(summary.title) ?? "Request",
  };
}

function normalizeEvlogEvent(value: unknown): StudioObserveEvlogEvent | null {
  const event = parseRecord(value);

  if (!event) {
    return null;
  }

  return {
    duration: parseNullableNumber(event.duration),
    fix: parseNullableString(event.fix),
    level: parseNullableString(event.level),
    link: parseNullableString(event.link),
    message: parseNullableString(event.message),
    method: parseNullableString(event.method),
    path: parseNullableString(event.path),
    raw: value,
    requestId: parseNullableString(event.requestId),
    service: parseNullableString(event.service),
    spanId: parseNullableString(event.spanId),
    status: parseNullableNumber(event.status),
    timestamp: parseNullableString(event.timestamp),
    traceId: parseNullableString(event.traceId),
    why: parseNullableString(event.why),
  };
}

function normalizeEvlog(value: unknown): StudioObserveEvlog | null {
  const evlog = parseRecord(value);

  if (!evlog) {
    return null;
  }

  const matches = Array.isArray(evlog.matches) ? evlog.matches : [];

  return {
    matchCount: matches.length,
    primary: normalizeEvlogEvent(evlog.primary),
    stream: parseNullableString(evlog.stream) ?? "",
  };
}

function normalizeTraceTreeNode(
  value: unknown,
  depth: number,
): StudioObserveTraceTreeNode | null {
  const node = parseRecord(value);
  const spanId = parseNullableString(node?.spanId);

  if (!node || !spanId) {
    return null;
  }

  const children = Array.isArray(node.children)
    ? node.children
        .map((child) => normalizeTraceTreeNode(child, depth + 1))
        .filter((child): child is StudioObserveTraceTreeNode => child !== null)
    : [];

  return {
    children,
    depth,
    duration: parseNullableNumber(node.duration),
    endTime: parseNullableString(node.endTime),
    kind: parseNullableString(node.kind) ?? "unspecified",
    name: parseNullableString(node.name) ?? spanId,
    parentSpanId: parseNullableString(node.parentSpanId),
    service: parseNullableString(node.service),
    spanId,
    startTime: parseNullableString(node.startTime) ?? "",
    statusCode: parseNullableString(node.statusCode) ?? "unset",
  };
}

function normalizeTrace(value: unknown): StudioObserveTrace | null {
  const trace = parseRecord(value);

  if (!trace) {
    return null;
  }

  const spans = Array.isArray(trace.spans) ? trace.spans : [];
  const spansById = new Map<string, unknown>();

  for (const span of spans) {
    const spanRecord = parseRecord(span);
    const spanId = parseNullableString(spanRecord?.spanId);

    if (spanId && !spansById.has(spanId)) {
      spansById.set(spanId, span);
    }
  }

  const tree = Array.isArray(trace.tree)
    ? trace.tree
        .map((node) => normalizeTraceTreeNode(node, 0))
        .filter((node): node is StudioObserveTraceTreeNode => node !== null)
    : [];
  const serviceMap = Array.isArray(trace.serviceMap)
    ? trace.serviceMap
        .map((edge): StudioObserveServiceEdge | null => {
          const edgeRecord = parseRecord(edge);
          const from = parseNullableString(edgeRecord?.from);
          const to = parseNullableString(edgeRecord?.to);

          if (!from || !to) {
            return null;
          }

          return {
            count: parseNullableNumber(edgeRecord?.count) ?? 0,
            errorCount: parseNullableNumber(edgeRecord?.errorCount) ?? 0,
            from,
            to,
          };
        })
        .filter((edge): edge is StudioObserveServiceEdge => edge !== null)
    : [];
  const errors = Array.isArray(trace.errors)
    ? trace.errors
        .map((error): StudioObserveTraceError | null => {
          const errorRecord = parseRecord(error);
          const spanId = parseNullableString(errorRecord?.spanId);

          if (!spanId) {
            return null;
          }

          return {
            message: parseNullableString(errorRecord?.message),
            name: parseNullableString(errorRecord?.name) ?? spanId,
            service: parseNullableString(errorRecord?.service),
            spanId,
            time: parseNullableString(errorRecord?.time),
            type: parseNullableString(errorRecord?.type),
          };
        })
        .filter((error): error is StudioObserveTraceError => error !== null)
    : [];
  const missingParents = Array.isArray(trace.missingParents)
    ? trace.missingParents.filter(
        (parent): parent is string => typeof parent === "string",
      )
    : [];
  const criticalPath = Array.isArray(trace.criticalPath)
    ? trace.criticalPath.filter(
        (spanId): spanId is string => typeof spanId === "string",
      )
    : [];

  return {
    criticalPath,
    duplicateSpans: parseNullableNumber(trace.duplicateSpans) ?? 0,
    errors,
    missingParents,
    partial: trace.partial === true,
    rootSpanId: parseNullableString(trace.rootSpanId),
    serviceMap,
    spanCount: spansById.size,
    spansById,
    stream: parseNullableString(trace.stream) ?? "",
    traceId: parseNullableString(trace.traceId),
    tree,
  };
}

function normalizeTimeline(value: unknown): StudioObserveTimelineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: StudioObserveTimelineItem[] = [];

  for (const [index, item] of value.entries()) {
    const itemRecord = parseRecord(item);
    const time = parseNullableString(itemRecord?.time);
    const kind = parseNullableString(itemRecord?.kind);

    if (!itemRecord || !time || !kind) {
      continue;
    }

    const ids = parseRecord(itemRecord.ids) ?? {};
    const source = parseRecord(itemRecord.source) ?? {};

    items.push({
      duration: parseNullableNumber(itemRecord.duration),
      id: `${index}:${kind}:${time}`,
      kind,
      service: parseNullableString(itemRecord.service),
      severity: parseNullableString(itemRecord.severity) ?? "info",
      sourceProfile: parseNullableString(source.profile),
      sourceStream: parseNullableString(source.stream),
      spanId: parseNullableString(ids.spanId),
      time,
      title: parseNullableString(itemRecord.title) ?? kind,
    });
  }

  return items;
}

function normalizeCoverageSide(
  value: unknown,
): StudioObserveCoverageSide | null {
  const side = parseRecord(value);

  if (!side || side.searched !== true) {
    return null;
  }

  return {
    complete: side.complete === true,
    hits: parseNullableNumber(side.hits) ?? 0,
    limitReached: side.limit_reached === true,
    searched: true,
    timedOut: side.timed_out === true,
  };
}

function normalizeCoverage(value: unknown): StudioObserveCoverage {
  const coverage = parseRecord(value) ?? {};
  const warnings = Array.isArray(coverage.warnings)
    ? coverage.warnings.filter(
        (warning): warning is string => typeof warning === "string",
      )
    : [];

  return {
    events: normalizeCoverageSide(coverage.events),
    traces: normalizeCoverageSide(coverage.traces),
    warnings,
  };
}

export function normalizeObserveRequestResponse(
  payload: unknown,
): StudioObserveRequestResult {
  const response = parseRecord(payload) ?? {};
  const lookup = parseRecord(response.lookup) ?? {};

  return {
    coverage: normalizeCoverage(response.coverage),
    evlog: normalizeEvlog(response.evlog),
    lookup: {
      requestId: parseNullableString(lookup.requestId),
      spanId: parseNullableString(lookup.spanId),
      traceId: parseNullableString(lookup.traceId),
    },
    summary: normalizeSummary(response.summary),
    timeline: normalizeTimeline(response.timeline),
    trace: normalizeTrace(response.trace),
  };
}

export function useStreamObserveRequest(args: UseStreamObserveRequestArgs) {
  const { eventsStream, lookup, tracesStream } = args;
  const { streamsUrl } = useStudio();
  const observeUrl = useMemo(
    () => createObserveRequestUrl(streamsUrl),
    [streamsUrl],
  );
  const isEnabled =
    observeUrl.length > 0 &&
    lookup !== null &&
    (eventsStream !== null || tracesStream !== null);

  const query = useQuery<StudioObserveRequestResult>({
    enabled: isEnabled,
    queryFn: async ({ signal }) => {
      if (!lookup) {
        throw new Error("Missing observe lookup");
      }

      const response = await fetch(observeUrl, {
        body: JSON.stringify({
          include: {
            events: eventsStream !== null,
            timeline: true,
            trace: tracesStream !== null,
          },
          limits: {
            events: OBSERVE_EVENTS_LIMIT,
            spans: OBSERVE_SPANS_LIMIT,
          },
          lookup: {
            [lookup.kind]: lookup.value,
          },
          streams: {
            ...(eventsStream !== null ? { events: eventsStream } : {}),
            ...(tracesStream !== null ? { traces: tracesStream } : {}),
          },
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `Failed loading request details (${response.status} ${response.statusText})`,
        );
      }

      return normalizeObserveRequestResponse(await response.json());
    },
    queryKey: [
      "stream-observe-request",
      observeUrl,
      "events",
      eventsStream ?? "",
      "traces",
      tracesStream ?? "",
      "lookup",
      lookup?.kind ?? "",
      lookup?.value ?? "",
    ],
    refetchInterval: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    retryOnMount: false,
    staleTime: Infinity,
  });

  return {
    ...query,
    result: query.data ?? null,
  };
}
