import { queryCollectionOptions } from "@tanstack/query-db-collection";
import {
  type Collection,
  createCollection,
  useLiveQuery,
} from "@tanstack/react-db";
import { type QueryKey, useIsFetching, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useStudio } from "../studio/context";
import type { StudioStreamSearchConfig } from "./use-stream-details";
import type { StudioStream } from "./use-streams";

const OFFSET_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PREVIEW_CHARACTER_LIMIT = 280;
export const STREAM_EVENTS_PAGE_SIZE = 50;

type StreamEventCollection = Collection<StudioStreamEvent, string>;
type RefetchableStreamEventCollection = StreamEventCollection & {
  utils: {
    refetch: (args: { throwOnError: boolean }) => Promise<void>;
  };
};

export interface StudioStreamEventIndexedField {
  id: string;
  label: string;
  value?: string;
}

export interface StudioStreamEvent {
  body: unknown;
  exactTimestamp: string | null;
  id: string;
  indexedFields: StudioStreamEventIndexedField[];
  key: string | null;
  offset: string;
  preview: string;
  sequence: string;
  sizeBytes: number;
  sortOffset: string;
  streamName: string;
}

export interface StreamEventsWindow {
  offset: string;
  requestedEventCount: number;
  startExclusiveSequence: bigint;
  totalEventCount: bigint;
}

export interface NormalizeStreamEventsArgs {
  events: unknown[];
  searchConfig?: StudioStreamSearchConfig | null;
  startExclusiveSequence: bigint;
  stream: Pick<StudioStream, "epoch" | "name">;
}

export interface UseStreamEventsArgs {
  liveUpdatesEnabled?: boolean;
  pageCount: number;
  pageSize?: number;
  searchConfig?: StudioStreamSearchConfig | null;
  searchQuery?: string;
  searchVisibleResultCount?: bigint;
  stream: StudioStream | null | undefined;
  visibleEventCount?: bigint;
}

export interface UseStreamEventsState {
  collection: StreamEventCollection | null;
  events: StudioStreamEvent[];
  hasHiddenNewerEvents: boolean;
  hasMoreEvents: boolean;
  hiddenNewerEventCount: bigint;
  isFetching: boolean;
  matchedEventCount: bigint | null;
  pageSize: number;
  queryScopeKey: string;
  refetch: () => Promise<void>;
  totalEventCount: bigint;
  visibleEventCount: bigint;
}

interface LastResolvedStreamEventsState {
  epoch: number;
  events: StudioStreamEvent[];
  searchQuery: string;
  streamName: string;
}

interface StreamSearchScopeState {
  searchQuery: string;
  searchUrl: string;
  streamEpoch: number;
  streamName: string;
  streamsUrl: string;
}

interface StreamSearchApiHit {
  offset: string;
  source: unknown;
}

interface StreamSearchApiPayload {
  hits: unknown[];
  next_search_after: unknown[] | null;
  total: {
    relation: "eq" | "gte";
    value: number;
  };
}

interface StreamSearchMetadata {
  hasMoreOlderResults: boolean;
  isResolved: boolean;
  totalMatchCount: bigint;
}

const EMPTY_STREAM_SEARCH_METADATA: StreamSearchMetadata = {
  hasMoreOlderResults: false,
  isResolved: false,
  totalMatchCount: 0n,
};

function isStreamSearchMetadata(value: unknown): value is StreamSearchMetadata {
  return (
    isRecord(value) &&
    typeof value.hasMoreOlderResults === "boolean" &&
    typeof value.isResolved === "boolean" &&
    typeof value.totalMatchCount === "bigint"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringifyPrimitive(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return null;
}

function stringifyJson(value: unknown, indent: number): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "undefined";
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  const seen = new WeakSet<object>();

  const serialized = JSON.stringify(
    value,
    (_key, currentValue: unknown) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }

      if (typeof currentValue === "object" && currentValue !== null) {
        if (seen.has(currentValue)) {
          return "[Circular]";
        }

        seen.add(currentValue);
      }

      return currentValue;
    },
    indent,
  );

  return serialized ?? String(value);
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function createPreview(value: unknown): string {
  const preferredValue =
    isRecord(value) && "value" in value && value.value !== undefined
      ? value.value
      : value;
  const previewText = compactText(stringifyJson(preferredValue, 0));

  if (previewText.length <= PREVIEW_CHARACTER_LIMIT) {
    return previewText;
  }

  return `${previewText.slice(0, PREVIEW_CHARACTER_LIMIT - 1)}…`;
}

function estimateSizeBytes(value: unknown): number {
  return new TextEncoder().encode(stringifyJson(value, 0)).length;
}

function normalizeTimestampValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds =
      Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === "string") {
    const timestamp = Date.parse(value);

    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }

  return null;
}

function unescapeJsonPointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function readJsonPointerValue(value: unknown, jsonPointer: string): unknown[] {
  if (jsonPointer === "") {
    return [value];
  }

  if (!jsonPointer.startsWith("/")) {
    return [];
  }

  const segments = jsonPointer
    .slice(1)
    .split("/")
    .map((segment) => unescapeJsonPointerSegment(segment));
  let currentValue = value;

  for (const segment of segments) {
    if (Array.isArray(currentValue)) {
      const index = Number(segment);

      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= currentValue.length
      ) {
        return [];
      }

      currentValue = currentValue[index];
      continue;
    }

    if (!isRecord(currentValue) || !(segment in currentValue)) {
      return [];
    }

    currentValue = currentValue[segment];
  }

  if (Array.isArray(currentValue)) {
    return currentValue;
  }

  return [currentValue];
}

function getPrimaryTimestampCandidates(args: {
  searchConfig?: StudioStreamSearchConfig | null;
  value: Record<string, unknown>;
}): unknown[] {
  const { searchConfig, value } = args;

  if (!searchConfig) {
    return [];
  }

  const primaryTimestampField =
    searchConfig.fields[searchConfig.primaryTimestampField];

  if (!primaryTimestampField) {
    return [];
  }

  return [
    ...primaryTimestampField.bindings.flatMap((binding) =>
      readJsonPointerValue(value, binding.jsonPointer),
    ),
    value[searchConfig.primaryTimestampField],
  ];
}

function extractExactTimestamp(
  value: unknown,
  searchConfig?: StudioStreamSearchConfig | null,
): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const headers = isRecord(value.headers) ? value.headers : null;
  const candidates = [
    ...getPrimaryTimestampCandidates({ searchConfig, value }),
    headers?.timestamp,
    value.timestamp,
    value.time,
    value.createdAt,
    value.created_at,
    value.occurredAt,
    value.occurred_at,
    value.windowEnd,
    value.windowStart,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTimestampValue(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractKey(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const headers = isRecord(value.headers) ? value.headers : null;
  const candidates = [
    value.key,
    headers?.key,
    value.routingKey,
    value.routing_key,
  ];

  for (const candidate of candidates) {
    const normalized = stringifyPrimitive(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeIndexedFieldEntry(
  value: unknown,
  index: number,
): StudioStreamEventIndexedField | null {
  const primitive = stringifyPrimitive(value);

  if (primitive) {
    return {
      id: `indexed:${index}:${primitive}`,
      label: primitive,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const labelCandidate =
    stringifyPrimitive(value.label) ??
    stringifyPrimitive(value.name) ??
    stringifyPrimitive(value.field) ??
    stringifyPrimitive(value.key);
  const valueCandidate =
    stringifyPrimitive(value.value) ??
    stringifyPrimitive(value.values) ??
    stringifyPrimitive(value.path);

  if (!labelCandidate) {
    return null;
  }

  return {
    id: `indexed:${index}:${labelCandidate}:${valueCandidate ?? ""}`,
    label: labelCandidate,
    value: valueCandidate ?? undefined,
  };
}

function extractIndexedFields(value: unknown): StudioStreamEventIndexedField[] {
  if (!isRecord(value)) {
    return [];
  }

  const explicitIndexedValue =
    value.indexedFields !== undefined ? value.indexedFields : value.indexed;

  if (Array.isArray(explicitIndexedValue)) {
    return explicitIndexedValue
      .map((item, index) => normalizeIndexedFieldEntry(item, index))
      .filter((item): item is StudioStreamEventIndexedField => item !== null);
  }

  if (isRecord(explicitIndexedValue)) {
    return Object.entries(explicitIndexedValue)
      .map(([label, fieldValue], index) => {
        const normalizedValue = stringifyPrimitive(fieldValue);

        return {
          id: `indexed:${index}:${label}:${normalizedValue ?? ""}`,
          label,
          value: normalizedValue ?? undefined,
        };
      })
      .filter((item) => item.label.length > 0 && item.value !== undefined);
  }

  return [];
}

function writeU32BE(dst: Uint8Array, offset: number, value: number): void {
  const dataView = new DataView(dst.buffer, dst.byteOffset, dst.byteLength);
  dataView.setUint32(offset, value >>> 0, false);
}

function readU32BE(src: Uint8Array, offset: number): number {
  const dataView = new DataView(src.buffer, src.byteOffset, src.byteLength);
  return dataView.getUint32(offset, false);
}

export function encodeStreamOffset(
  epoch: number,
  sequence: bigint,
  inBlock = 0,
): string {
  if (sequence < -1n) {
    throw new Error("invalid offset");
  }

  const bytes = new Uint8Array(16);
  const rawSequence = sequence + 1n;
  const high = Number((rawSequence >> 32n) & 0xffffffffn);
  const low = Number(rawSequence & 0xffffffffn);

  writeU32BE(bytes, 0, epoch >>> 0);
  writeU32BE(bytes, 4, high);
  writeU32BE(bytes, 8, low);
  writeU32BE(bytes, 12, inBlock >>> 0);

  let encodedValue = 0n;

  for (const byte of bytes) {
    encodedValue = (encodedValue << 8n) | BigInt(byte);
  }

  encodedValue <<= 2n;

  let encodedOffset = "";

  for (let index = 0; index < 26; index += 1) {
    const shift = 5n * BigInt(25 - index);
    const alphabetIndex = Number((encodedValue >> shift) & 31n);
    encodedOffset += OFFSET_ALPHABET[alphabetIndex];
  }

  return encodedOffset;
}

function decodeStreamSequence(offset: string): bigint | null {
  if (offset === "-1") {
    return -1n;
  }

  if (offset.length !== 26) {
    return null;
  }

  let encodedValue = 0n;

  for (const character of offset) {
    const alphabetIndex = OFFSET_ALPHABET.indexOf(character.toUpperCase());

    if (alphabetIndex < 0) {
      return null;
    }

    encodedValue = (encodedValue << 5n) | BigInt(alphabetIndex);
  }

  encodedValue >>= 2n;

  const bytes = new Uint8Array(16);

  for (let index = 15; index >= 0; index -= 1) {
    bytes[index] = Number(encodedValue & 0xffn);
    encodedValue >>= 8n;
  }

  const rawSequence =
    (BigInt(readU32BE(bytes, 4)) << 32n) | BigInt(readU32BE(bytes, 8));

  return rawSequence - 1n;
}

function parseNonNegativeBigInt(value: string): bigint {
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

function getResolvedVisibleEventCount(
  latestEventCount: bigint,
  visibleEventCount: bigint | undefined,
): bigint {
  if (visibleEventCount === undefined) {
    return latestEventCount;
  }

  if (visibleEventCount <= 0n) {
    return 0n;
  }

  return visibleEventCount > latestEventCount
    ? latestEventCount
    : visibleEventCount;
}

function getResolvedVisibleSearchResultCount(
  visibleSearchResultCount: bigint | undefined,
  pageSize: number,
): bigint {
  if (visibleSearchResultCount === undefined) {
    return BigInt(Math.max(1, Math.trunc(pageSize)));
  }

  return visibleSearchResultCount > 0n ? visibleSearchResultCount : 0n;
}

function bigintToRequestCount(value: bigint): number {
  if (value <= 0n) {
    return 0;
  }

  return value > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(value);
}

export function getStreamEventsWindow(args: {
  epoch: number;
  visibleEventCount: bigint;
  pageCount: number;
  pageSize: number;
}): StreamEventsWindow {
  const pageCount = Math.max(1, Math.trunc(args.pageCount));
  const pageSize = Math.max(1, Math.trunc(args.pageSize));
  const totalEventCount =
    args.visibleEventCount >= 0n ? args.visibleEventCount : 0n;
  const desiredEventCount = BigInt(pageCount * pageSize);
  const requestedEventCountBigInt =
    totalEventCount < desiredEventCount ? totalEventCount : desiredEventCount;
  const requestedEventCount = Number(requestedEventCountBigInt);
  const startExclusiveSequence =
    requestedEventCountBigInt >= totalEventCount
      ? -1n
      : totalEventCount - requestedEventCountBigInt - 1n;

  return {
    offset:
      startExclusiveSequence < 0n
        ? "-1"
        : encodeStreamOffset(args.epoch, startExclusiveSequence),
    requestedEventCount,
    startExclusiveSequence,
    totalEventCount,
  };
}

export function createStreamReadUrl(
  streamsUrl: string | undefined,
  streamName: string,
  offset: string,
): string {
  const trimmed = streamsUrl?.trim();

  if (!trimmed) {
    return "";
  }

  const encodedName = encodeURIComponent(streamName);

  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(/\/+$/, "");

    url.pathname = `${pathname}/v1/stream/${encodedName}`;
    url.search = `?format=json&offset=${encodeURIComponent(offset)}`;
    url.hash = "";

    return url.toString();
  } catch {
    const pathname = trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");

    return `${pathname}/v1/stream/${encodedName}?format=json&offset=${encodeURIComponent(offset)}`;
  }
}

function createStreamSearchUrl(
  streamsUrl: string | undefined,
  streamName: string,
): string {
  const trimmed = streamsUrl?.trim();

  if (!trimmed) {
    return "";
  }

  const encodedName = encodeURIComponent(streamName);

  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(/\/+$/, "");

    url.pathname = `${pathname}/v1/stream/${encodedName}/_search`;
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    const pathname = trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");

    return `${pathname}/v1/stream/${encodedName}/_search`;
  }
}

function isStreamSearchApiHit(value: unknown): value is StreamSearchApiHit {
  return (
    isRecord(value) && typeof value.offset === "string" && "source" in value
  );
}

function isStreamSearchApiPayload(
  value: unknown,
): value is StreamSearchApiPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.hits) &&
    isRecord(value.total) &&
    typeof value.total.value === "number" &&
    (value.total.relation === "eq" || value.total.relation === "gte") &&
    (value.next_search_after === null || Array.isArray(value.next_search_after))
  );
}

function normalizeSearchQuery(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function getStreamSearchSort(
  _searchConfig: StudioStreamSearchConfig | null | undefined,
): string[] {
  return ["offset:desc"];
}

function compareStreamEvents(
  left: StudioStreamEvent,
  right: StudioStreamEvent,
): number {
  if (left.sortOffset !== right.sortOffset) {
    return left.sortOffset.localeCompare(right.sortOffset);
  }

  return left.id.localeCompare(right.id);
}

export function normalizeStreamEvents(
  args: NormalizeStreamEventsArgs,
): StudioStreamEvent[] {
  const { events, searchConfig, startExclusiveSequence, stream } = args;

  return events.map((event, index) => {
    const sequence = startExclusiveSequence + BigInt(index) + 1n;
    const offset = encodeStreamOffset(stream.epoch, sequence);

    return {
      body: event,
      exactTimestamp: extractExactTimestamp(event, searchConfig),
      id: `${stream.name}:${offset}`,
      indexedFields: extractIndexedFields(event),
      key: extractKey(event),
      offset,
      preview: createPreview(event),
      sequence: sequence.toString(),
      sizeBytes: estimateSizeBytes(event),
      sortOffset: offset,
      streamName: stream.name,
    };
  });
}

function normalizeStreamSearchHits(args: {
  hits: StreamSearchApiHit[];
  searchConfig?: StudioStreamSearchConfig | null;
  stream: Pick<StudioStream, "name">;
}): StudioStreamEvent[] {
  const { hits, searchConfig, stream } = args;

  return hits.map((hit) => {
    const sequence = decodeStreamSequence(hit.offset);

    return {
      body: hit.source,
      exactTimestamp: extractExactTimestamp(hit.source, searchConfig),
      id: `${stream.name}:${hit.offset}`,
      indexedFields: extractIndexedFields(hit.source),
      key: extractKey(hit.source),
      offset: hit.offset,
      preview: createPreview(hit.source),
      sequence: sequence?.toString() ?? hit.offset,
      sizeBytes: estimateSizeBytes(hit.source),
      sortOffset: hit.offset,
      streamName: stream.name,
    };
  });
}

export function getStreamEventsQueryScopeKey(
  streamsUrl: string | undefined,
  stream: StudioStream | null | undefined,
  pageSize: number,
  pageCount: number,
  visibleEventCount: bigint,
): string {
  if (!stream) {
    return "";
  }

  return [
    streamsUrl?.trim() ?? "",
    stream.name,
    String(stream.epoch),
    visibleEventCount.toString(),
    String(pageSize),
    String(pageCount),
  ].join("::");
}

function getStreamSearchEventsQueryScopeKey(args: {
  pageSize: number;
  resolvedVisibleSearchResultCount: bigint;
  searchQuery: string;
  searchSort: string[];
  stream: StudioStream | null | undefined;
  streamsUrl: string | undefined;
}): string {
  const {
    pageSize,
    resolvedVisibleSearchResultCount,
    searchQuery,
    searchSort,
    stream,
    streamsUrl,
  } = args;

  if (!stream) {
    return "";
  }

  return [
    streamsUrl?.trim() ?? "",
    stream.name,
    String(stream.epoch),
    "search",
    searchQuery,
    searchSort.join(","),
    resolvedVisibleSearchResultCount.toString(),
    String(pageSize),
  ].join("::");
}

function matchesSearchEventsQueryKey(args: {
  queryKey: QueryKey;
  scope: StreamSearchScopeState;
}): boolean {
  const { queryKey, scope } = args;

  return (
    queryKey[0] === "streams" &&
    queryKey[1] === scope.streamsUrl &&
    queryKey[2] === "stream" &&
    queryKey[3] === scope.streamName &&
    queryKey[4] === "epoch" &&
    queryKey[5] === scope.streamEpoch &&
    queryKey[6] === "search" &&
    queryKey[7] === scope.searchQuery
  );
}

function matchesSearchHeadQueryKey(args: {
  queryKey: QueryKey;
  scope: StreamSearchScopeState;
}): boolean {
  const { queryKey, scope } = args;

  return (
    queryKey[0] === "stream-search-head" &&
    queryKey[1] === scope.searchUrl &&
    queryKey[4] === scope.searchQuery
  );
}

export function useStreamEvents(
  args: UseStreamEventsArgs,
): UseStreamEventsState {
  const {
    liveUpdatesEnabled = false,
    pageCount,
    pageSize = STREAM_EVENTS_PAGE_SIZE,
    searchConfig,
    searchQuery,
    searchVisibleResultCount,
    stream,
    visibleEventCount,
  } = args;
  const studio = useStudio();
  const { streamsUrl, queryClient } = studio;
  const normalizedPageCount = Math.max(1, Math.trunc(pageCount));
  const normalizedSearchQuery = normalizeSearchQuery(searchQuery);
  const isSearchActive =
    stream != null && searchConfig != null && normalizedSearchQuery.length > 0;
  const latestEventCount = useMemo(
    () => (stream ? parseNonNegativeBigInt(stream.nextOffset) : 0n),
    [stream],
  );
  const resolvedVisibleEventCount = useMemo(
    () => getResolvedVisibleEventCount(latestEventCount, visibleEventCount),
    [latestEventCount, visibleEventCount],
  );
  const resolvedVisibleSearchResultCount = useMemo(
    () =>
      getResolvedVisibleSearchResultCount(searchVisibleResultCount, pageSize),
    [pageSize, searchVisibleResultCount],
  );
  const searchSort = useMemo(
    () => getStreamSearchSort(searchConfig),
    [searchConfig],
  );
  const searchUrl = useMemo(
    () => (stream ? createStreamSearchUrl(streamsUrl, stream.name) : ""),
    [stream, streamsUrl],
  );
  const window = useMemo(
    () =>
      stream
        ? getStreamEventsWindow({
            epoch: stream.epoch,
            visibleEventCount: resolvedVisibleEventCount,
            pageCount: normalizedPageCount,
            pageSize,
          })
        : {
            offset: "-1",
            requestedEventCount: 0,
            startExclusiveSequence: -1n,
            totalEventCount: 0n,
          },
    [normalizedPageCount, pageSize, resolvedVisibleEventCount, stream],
  );
  const queryScopeKey = useMemo(() => {
    if (isSearchActive) {
      return getStreamSearchEventsQueryScopeKey({
        pageSize,
        resolvedVisibleSearchResultCount,
        searchQuery: normalizedSearchQuery,
        searchSort,
        stream,
        streamsUrl,
      });
    }

    return getStreamEventsQueryScopeKey(
      streamsUrl,
      stream,
      pageSize,
      normalizedPageCount,
      resolvedVisibleEventCount,
    );
  }, [
    isSearchActive,
    normalizedPageCount,
    normalizedSearchQuery,
    pageSize,
    resolvedVisibleEventCount,
    resolvedVisibleSearchResultCount,
    searchSort,
    stream,
    streamsUrl,
  ]);
  const queryKey = useMemo<QueryKey | null>(() => {
    if (!stream || !streamsUrl) {
      return null;
    }

    if (isSearchActive) {
      return [
        "streams",
        streamsUrl,
        "stream",
        stream.name,
        "epoch",
        stream.epoch,
        "search",
        normalizedSearchQuery,
        "sort",
        searchSort.join(","),
        "visibleSearchResultCount",
        resolvedVisibleSearchResultCount.toString(),
        "pageSize",
        pageSize,
      ];
    }

    return [
      "streams",
      streamsUrl,
      "stream",
      stream.name,
      "epoch",
      stream.epoch,
      "visibleEventCount",
      resolvedVisibleEventCount.toString(),
      "pageSize",
      pageSize,
      "pageCount",
      normalizedPageCount,
    ];
  }, [
    isSearchActive,
    normalizedPageCount,
    normalizedSearchQuery,
    pageSize,
    resolvedVisibleEventCount,
    resolvedVisibleSearchResultCount,
    searchSort,
    stream,
    streamsUrl,
  ]);
  const searchMetadataQueryKey = useMemo<QueryKey>(
    () => ["stream-search-metadata", queryScopeKey || "inactive"],
    [queryScopeKey],
  );
  const searchMetadataQuery = useQuery<StreamSearchMetadata>({
    enabled: false,
    initialData: EMPTY_STREAM_SEARCH_METADATA,
    queryFn: () => EMPTY_STREAM_SEARCH_METADATA,
    queryKey: searchMetadataQueryKey,
    staleTime: Infinity,
  });
  const searchMetadata = isStreamSearchMetadata(searchMetadataQuery.data)
    ? searchMetadataQuery.data
    : EMPTY_STREAM_SEARCH_METADATA;
  const searchHeadQuery = useQuery<StreamSearchMetadata>({
    enabled:
      isSearchActive &&
      searchUrl.length > 0 &&
      liveUpdatesEnabled &&
      searchMetadata.isResolved &&
      Boolean(stream),
    queryFn: async ({ signal }) => {
      const response = await fetch(searchUrl, {
        body: JSON.stringify({
          q: normalizedSearchQuery,
          size: 1,
          sort: searchSort,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `Failed loading stream search results (${response.status} ${response.statusText})`,
        );
      }

      const payload = (await response.json()) as unknown;

      if (!isStreamSearchApiPayload(payload)) {
        throw new Error(
          "Streams server returned an invalid search response shape.",
        );
      }

      return {
        hasMoreOlderResults: searchMetadata.hasMoreOlderResults,
        isResolved: true,
        totalMatchCount:
          payload.total.value > 0 ? BigInt(payload.total.value) : 0n,
      } satisfies StreamSearchMetadata;
    },
    queryKey: [
      "stream-search-head",
      searchUrl,
      stream?.epoch ?? -1,
      stream?.nextOffset ?? "",
      normalizedSearchQuery,
      searchSort.join(","),
    ],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    retryOnMount: false,
    staleTime: Infinity,
  });
  const searchHeadMetadata = isStreamSearchMetadata(searchHeadQuery.data)
    ? searchHeadQuery.data
    : EMPTY_STREAM_SEARCH_METADATA;
  const collection = useMemo<StreamEventCollection | null>(() => {
    if (!stream || !streamsUrl || !queryScopeKey || !queryKey) {
      return null;
    }

    return studio.getOrCreateRowsCollection<StreamEventCollection>(
      queryScopeKey,
      () =>
        createCollection(
          queryCollectionOptions({
            compare: compareStreamEvents,
            gcTime: 0,
            id: `stream-events:${queryScopeKey}`,
            getKey(item) {
              return item.id;
            },
            queryClient,
            queryFn: async ({ signal }) => {
              if (isSearchActive) {
                const requestedResultCount = bigintToRequestCount(
                  resolvedVisibleSearchResultCount,
                );

                if (requestedResultCount === 0) {
                  queryClient.setQueryData(searchMetadataQueryKey, {
                    hasMoreOlderResults: false,
                    isResolved: true,
                    totalMatchCount: 0n,
                  } satisfies StreamSearchMetadata);

                  return [];
                }

                let remainingResultCount = requestedResultCount;
                let searchAfter: unknown[] | null = null;
                let hasMoreOlderResults = false;
                let totalMatchCount = 0n;
                const hits: StreamSearchApiHit[] = [];

                while (remainingResultCount > 0) {
                  const response = await fetch(searchUrl, {
                    body: JSON.stringify({
                      q: normalizedSearchQuery,
                      search_after: searchAfter ?? undefined,
                      size: Math.min(pageSize, remainingResultCount),
                      sort: searchSort,
                    }),
                    headers: {
                      "content-type": "application/json",
                    },
                    method: "POST",
                    signal,
                  });

                  if (!response.ok) {
                    throw new Error(
                      `Failed loading stream search results (${response.status} ${response.statusText})`,
                    );
                  }

                  const payload = (await response.json()) as unknown;

                  if (!isStreamSearchApiPayload(payload)) {
                    throw new Error(
                      "Streams server returned an invalid search response shape.",
                    );
                  }

                  const pageHits = payload.hits.filter(isStreamSearchApiHit);

                  totalMatchCount =
                    payload.total.value > 0 ? BigInt(payload.total.value) : 0n;

                  hasMoreOlderResults = payload.next_search_after !== null;

                  if (pageHits.length === 0) {
                    break;
                  }

                  hits.push(...pageHits);
                  remainingResultCount -= pageHits.length;

                  if (!payload.next_search_after) {
                    break;
                  }

                  searchAfter = payload.next_search_after;
                }

                queryClient.setQueryData(searchMetadataQueryKey, {
                  hasMoreOlderResults,
                  isResolved: true,
                  totalMatchCount,
                } satisfies StreamSearchMetadata);

                return normalizeStreamSearchHits({
                  hits,
                  searchConfig,
                  stream,
                });
              }

              const response = await fetch(
                createStreamReadUrl(streamsUrl, stream.name, window.offset),
                { signal },
              );

              if (response.status === 204) {
                return [];
              }

              if (!response.ok) {
                throw new Error(
                  `Failed loading stream events (${response.status} ${response.statusText})`,
                );
              }

              const payload = (await response.json()) as unknown;

              if (!Array.isArray(payload)) {
                throw new Error(
                  "Streams server returned an invalid events response shape.",
                );
              }

              const visiblePayload =
                payload.length > window.requestedEventCount
                  ? payload.slice(0, window.requestedEventCount)
                  : payload;

              return normalizeStreamEvents({
                events: visiblePayload,
                searchConfig,
                startExclusiveSequence: window.startExclusiveSequence,
                stream,
              });
            },
            queryKey: () => queryKey,
            retry: false,
            staleTime: Infinity,
          }),
        ),
    );
  }, [
    isSearchActive,
    normalizedSearchQuery,
    pageSize,
    queryClient,
    queryKey,
    queryScopeKey,
    resolvedVisibleSearchResultCount,
    searchConfig,
    searchMetadataQueryKey,
    searchSort,
    searchUrl,
    stream,
    streamsUrl,
    studio,
    window.offset,
    window.requestedEventCount,
    window.startExclusiveSequence,
  ]);
  const { data: events = [], isLoading } = useLiveQuery(
    (query) => {
      if (!collection) {
        return undefined;
      }

      return query
        .from({ event: collection })
        .orderBy(({ event }) => event.sortOffset, {
          direction: "desc",
        })
        .orderBy(({ event }) => event.id, {
          direction: "desc",
        })
        .fn.select((row) => row.event);
    },
    [collection],
  );
  const isQueryFetching = useIsFetching(
    queryKey ? { queryKey, exact: true } : undefined,
    queryClient,
  );
  const lastResolvedEventsRef = useRef<LastResolvedStreamEventsState | null>(
    null,
  );
  const previousSearchScopeRef = useRef<StreamSearchScopeState | null>(null);
  const isFetching = isLoading || isQueryFetching > 0;

  useEffect(() => {
    const currentSearchScope =
      isSearchActive && stream && streamsUrl && searchUrl.length > 0
        ? {
            searchQuery: normalizedSearchQuery,
            searchUrl,
            streamEpoch: stream.epoch,
            streamName: stream.name,
            streamsUrl,
          }
        : null;
    const previousSearchScope = previousSearchScopeRef.current;

    if (
      previousSearchScope &&
      (!currentSearchScope ||
        previousSearchScope.searchQuery !== currentSearchScope.searchQuery ||
        previousSearchScope.streamName !== currentSearchScope.streamName ||
        previousSearchScope.streamEpoch !== currentSearchScope.streamEpoch)
    ) {
      const matchesPreviousSearchScope = ({
        queryKey,
      }: {
        queryKey: QueryKey;
      }) =>
        matchesSearchEventsQueryKey({
          queryKey,
          scope: previousSearchScope,
        }) ||
        matchesSearchHeadQueryKey({
          queryKey,
          scope: previousSearchScope,
        });

      void queryClient.cancelQueries({
        predicate: matchesPreviousSearchScope,
      });
      queryClient.removeQueries({
        predicate: matchesPreviousSearchScope,
      });
    }

    previousSearchScopeRef.current = currentSearchScope;
  }, [
    isSearchActive,
    normalizedSearchQuery,
    queryClient,
    searchUrl,
    stream,
    streamsUrl,
  ]);

  useEffect(() => {
    if (!stream) {
      lastResolvedEventsRef.current = null;
      return;
    }

    const currentResolvedState = lastResolvedEventsRef.current;
    const currentSearchKey = isSearchActive ? normalizedSearchQuery : "";

    if (
      currentResolvedState &&
      (currentResolvedState.streamName !== stream.name ||
        currentResolvedState.epoch !== stream.epoch ||
        currentResolvedState.searchQuery !== currentSearchKey)
    ) {
      lastResolvedEventsRef.current = null;
    }

    if (events.length === 0) {
      return;
    }

    lastResolvedEventsRef.current = {
      epoch: stream.epoch,
      events,
      searchQuery: currentSearchKey,
      streamName: stream.name,
    };
  }, [events, isSearchActive, normalizedSearchQuery, stream]);

  const visibleEvents =
    stream &&
    isFetching &&
    events.length === 0 &&
    lastResolvedEventsRef.current?.streamName === stream.name &&
    lastResolvedEventsRef.current?.epoch === stream.epoch &&
    lastResolvedEventsRef.current?.searchQuery ===
      (isSearchActive ? normalizedSearchQuery : "")
      ? lastResolvedEventsRef.current.events
      : events;
  const currentSearchSnapshotMatchCount = searchMetadata.isResolved
    ? searchMetadata.totalMatchCount
    : 0n;
  const latestMatchingEventCount: bigint = isSearchActive
    ? searchHeadMetadata.isResolved
      ? searchHeadMetadata.totalMatchCount
      : searchMetadata.totalMatchCount
    : 0n;
  const hiddenNewerEventCount = isSearchActive
    ? latestMatchingEventCount > currentSearchSnapshotMatchCount
      ? latestMatchingEventCount - currentSearchSnapshotMatchCount
      : 0n
    : latestEventCount > resolvedVisibleEventCount
      ? latestEventCount - resolvedVisibleEventCount
      : 0n;
  const hasMoreEvents = isSearchActive
    ? searchMetadata.isResolved
      ? searchMetadata.hasMoreOlderResults
      : true
    : BigInt(visibleEvents.length) < window.totalEventCount;

  const refetch = useCallback(async () => {
    if (!collection) {
      return;
    }

    await (collection as RefetchableStreamEventCollection).utils.refetch({
      throwOnError: true,
    });
  }, [collection]);
  const matchedEventCount: bigint | null = isSearchActive
    ? searchMetadata.isResolved
      ? latestMatchingEventCount
      : null
    : null;

  return {
    collection,
    events: visibleEvents,
    hasHiddenNewerEvents: hiddenNewerEventCount > 0n,
    hasMoreEvents,
    hiddenNewerEventCount,
    isFetching,
    matchedEventCount,
    pageSize,
    queryScopeKey,
    refetch,
    totalEventCount: latestEventCount,
    visibleEventCount: isSearchActive
      ? resolvedVisibleSearchResultCount
      : resolvedVisibleEventCount,
  };
}
