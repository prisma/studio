import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useStudio } from "../studio/context";
import {
  createRoutingKeysAfterCursorForPrefix,
  createRoutingKeysPrefixUpperBound,
} from "../studio/views/stream/stream-routing-key-search";

const STREAM_ROUTING_KEYS_PAGE_SIZE = 100;

interface StreamRoutingKeysApiPayload {
  coverage?: {
    complete?: unknown;
    indexed_segments?: unknown;
    possible_missing_local_segments?: unknown;
    possible_missing_uploaded_segments?: unknown;
    scanned_local_segments?: unknown;
    scanned_uploaded_segments?: unknown;
    scanned_wal_rows?: unknown;
  };
  keys?: unknown;
  next_after?: unknown;
  timing?: {
    fallback_scan_ms?: unknown;
    fallback_segment_get_ms?: unknown;
    fallback_wal_scan_ms?: unknown;
    lexicon_decode_ms?: unknown;
    lexicon_merge_ms?: unknown;
    lexicon_run_get_ms?: unknown;
    lexicon_runs_loaded?: unknown;
  };
  took_ms?: unknown;
}

export interface StreamRoutingKeysCoverage {
  complete: boolean;
  indexedSegments: number;
  possibleMissingLocalSegments: number;
  possibleMissingUploadedSegments: number;
  scannedLocalSegments: number;
  scannedUploadedSegments: number;
  scannedWalRows: number;
}

export interface StreamRoutingKeysTiming {
  fallbackScanMs: number;
  fallbackSegmentGetMs: number;
  fallbackWalScanMs: number;
  lexiconDecodeMs: number;
  lexiconMergeMs: number;
  lexiconRunGetMs: number;
  lexiconRunsLoaded: number;
}

interface StreamRoutingKeysPage {
  coverage: StreamRoutingKeysCoverage | null;
  keys: string[];
  lastKey: string | null;
  nextAfter: string | null;
  timing: StreamRoutingKeysTiming | null;
  tookMs: number | null;
}

type StreamRoutingKeysQueryKey = [
  "stream-routing-keys",
  string,
  "stream",
  string,
  "prefix",
  string,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStreamRoutingKeysApiPayload(
  value: unknown,
): value is StreamRoutingKeysApiPayload {
  return isRecord(value);
}

function parseNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

function normalizeRoutingKeysCoverage(
  value: unknown,
): StreamRoutingKeysCoverage | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    complete: value.complete === true,
    indexedSegments: parseNonNegativeInteger(value.indexed_segments),
    possibleMissingLocalSegments: parseNonNegativeInteger(
      value.possible_missing_local_segments,
    ),
    possibleMissingUploadedSegments: parseNonNegativeInteger(
      value.possible_missing_uploaded_segments,
    ),
    scannedLocalSegments: parseNonNegativeInteger(value.scanned_local_segments),
    scannedUploadedSegments: parseNonNegativeInteger(
      value.scanned_uploaded_segments,
    ),
    scannedWalRows: parseNonNegativeInteger(value.scanned_wal_rows),
  };
}

function normalizeRoutingKeysTiming(
  value: unknown,
): StreamRoutingKeysTiming | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    fallbackScanMs: parseNonNegativeInteger(value.fallback_scan_ms),
    fallbackSegmentGetMs: parseNonNegativeInteger(
      value.fallback_segment_get_ms,
    ),
    fallbackWalScanMs: parseNonNegativeInteger(value.fallback_wal_scan_ms),
    lexiconDecodeMs: parseNonNegativeInteger(value.lexicon_decode_ms),
    lexiconMergeMs: parseNonNegativeInteger(value.lexicon_merge_ms),
    lexiconRunGetMs: parseNonNegativeInteger(value.lexicon_run_get_ms),
    lexiconRunsLoaded: parseNonNegativeInteger(value.lexicon_runs_loaded),
  };
}

function createStreamRoutingKeysUrl(
  streamsUrl: string | undefined,
  streamName: string | null | undefined,
): string {
  const trimmedStreamsUrl = streamsUrl?.trim();
  const trimmedStreamName = streamName?.trim();

  if (!trimmedStreamsUrl || !trimmedStreamName) {
    return "";
  }

  const encodedStreamName = encodeURIComponent(trimmedStreamName);
  const suffix = `/v1/stream/${encodedStreamName}/_routing_keys`;

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

function appendRoutingKeysQueryParams(args: {
  after: string | null;
  routingKeysUrl: string;
}): string {
  try {
    const url = new URL(args.routingKeysUrl);

    url.searchParams.set("limit", String(STREAM_ROUTING_KEYS_PAGE_SIZE));

    if (args.after) {
      url.searchParams.set("after", args.after);
    }

    return url.toString();
  } catch {
    const separator = args.routingKeysUrl.includes("?") ? "&" : "?";
    const searchParams = new URLSearchParams();

    searchParams.set("limit", String(STREAM_ROUTING_KEYS_PAGE_SIZE));

    if (args.after) {
      searchParams.set("after", args.after);
    }

    return `${args.routingKeysUrl}${separator}${searchParams.toString()}`;
  }
}

async function parseStreamRoutingKeysResponse(
  response: Response,
): Promise<StreamRoutingKeysPage> {
  if (!response.ok) {
    throw new Error(
      `Failed loading routing keys (${response.status} ${response.statusText})`,
    );
  }

  const payload = (await response.json()) as unknown;

  if (!isStreamRoutingKeysApiPayload(payload)) {
    throw new Error(
      "Streams server returned an invalid routing key response shape.",
    );
  }

  const keys = Array.isArray(payload.keys)
    ? payload.keys.filter((key): key is string => typeof key === "string")
    : [];

  return {
    coverage: normalizeRoutingKeysCoverage(payload.coverage),
    keys,
    lastKey: keys.at(-1) ?? null,
    nextAfter:
      typeof payload.next_after === "string" ? payload.next_after : null,
    timing: normalizeRoutingKeysTiming(payload.timing),
    tookMs:
      typeof payload.took_ms === "number" && Number.isFinite(payload.took_ms)
        ? Math.max(0, Math.trunc(payload.took_ms))
        : null,
  };
}

export function useStreamRoutingKeys(args: {
  enabled?: boolean;
  prefix: string;
  streamName?: string | null;
}) {
  const { streamsUrl } = useStudio();
  const routingKeysUrl = useMemo(
    () => createStreamRoutingKeysUrl(streamsUrl, args.streamName),
    [args.streamName, streamsUrl],
  );
  const initialAfter = useMemo(
    () => createRoutingKeysAfterCursorForPrefix(args.prefix),
    [args.prefix],
  );
  const prefixUpperBound = useMemo(
    () => createRoutingKeysPrefixUpperBound(args.prefix),
    [args.prefix],
  );
  const queryKey = useMemo(
    (): StreamRoutingKeysQueryKey => [
      "stream-routing-keys",
      routingKeysUrl,
      "stream",
      args.streamName?.trim() ?? "",
      "prefix",
      args.prefix,
    ],
    [args.prefix, args.streamName, routingKeysUrl],
  );
  const query = useInfiniteQuery<
    StreamRoutingKeysPage,
    Error,
    InfiniteData<StreamRoutingKeysPage>,
    StreamRoutingKeysQueryKey,
    string | null
  >({
    enabled: (args.enabled ?? true) && routingKeysUrl.length > 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage.nextAfter) {
        return undefined;
      }

      if (
        prefixUpperBound &&
        lastPage.lastKey !== null &&
        lastPage.lastKey >= prefixUpperBound
      ) {
        return undefined;
      }

      return lastPage.nextAfter;
    },
    initialPageParam: initialAfter,
    queryFn: async ({ pageParam, signal }) => {
      const response = await fetch(
        appendRoutingKeysQueryParams({
          after: pageParam,
          routingKeysUrl,
        }),
        { signal },
      );

      return await parseStreamRoutingKeysResponse(response);
    },
    queryKey,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 30_000,
  });
  const keys = useMemo(() => {
    const flattenedKeys = query.data?.pages.flatMap((page) => page.keys) ?? [];
    const uniqueKeys = Array.from(new Set(flattenedKeys));

    if (args.prefix.length === 0) {
      return uniqueKeys;
    }

    return uniqueKeys.filter((key) => key.startsWith(args.prefix));
  }, [args.prefix, query.data]);
  const latestPage = query.data?.pages.at(-1) ?? null;
  const coverage = latestPage?.coverage ?? null;
  const timing = latestPage?.timing ?? null;

  return {
    ...query,
    coverage,
    hasMoreRoutingKeys: query.hasNextPage === true,
    isBestEffortBrowse: coverage?.complete === false,
    keys,
    loadMoreRoutingKeys: query.fetchNextPage,
    timing,
    tookMs: latestPage?.tookMs ?? null,
  };
}
