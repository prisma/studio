import { queryCollectionOptions } from "@tanstack/query-db-collection";
import {
  type Collection,
  createCollection,
  useLiveQuery,
} from "@tanstack/react-db";
import { type QueryKey, useIsFetching } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useStudio } from "../studio/context";
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
  startExclusiveSequence: bigint;
  stream: Pick<StudioStream, "epoch" | "name">;
}

export interface UseStreamEventsArgs {
  pageCount: number;
  pageSize?: number;
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
  pageSize: number;
  queryScopeKey: string;
  refetch: () => Promise<void>;
  totalEventCount: bigint;
  visibleEventCount: bigint;
}

interface LastResolvedStreamEventsState {
  epoch: number;
  events: StudioStreamEvent[];
  streamName: string;
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

function extractExactTimestamp(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const headers = isRecord(value.headers) ? value.headers : null;
  const candidates = [
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
  const { events, startExclusiveSequence, stream } = args;

  return events.map((event, index) => {
    const sequence = startExclusiveSequence + BigInt(index) + 1n;
    const offset = encodeStreamOffset(stream.epoch, sequence);

    return {
      body: event,
      exactTimestamp: extractExactTimestamp(event),
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

export function useStreamEvents(
  args: UseStreamEventsArgs,
): UseStreamEventsState {
  const {
    pageCount,
    pageSize = STREAM_EVENTS_PAGE_SIZE,
    stream,
    visibleEventCount,
  } = args;
  const studio = useStudio();
  const { streamsUrl, queryClient } = studio;
  const normalizedPageCount = Math.max(1, Math.trunc(pageCount));
  const latestEventCount = useMemo(
    () => (stream ? parseNonNegativeBigInt(stream.nextOffset) : 0n),
    [stream],
  );
  const resolvedVisibleEventCount = useMemo(
    () => getResolvedVisibleEventCount(latestEventCount, visibleEventCount),
    [latestEventCount, visibleEventCount],
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
  const queryScopeKey = useMemo(
    () =>
      getStreamEventsQueryScopeKey(
        streamsUrl,
        stream,
        pageSize,
        normalizedPageCount,
        resolvedVisibleEventCount,
      ),
    [
      normalizedPageCount,
      pageSize,
      resolvedVisibleEventCount,
      stream,
      streamsUrl,
    ],
  );
  const queryKey = useMemo<QueryKey | null>(
    () =>
      stream && streamsUrl
        ? [
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
          ]
        : null,
    [
      normalizedPageCount,
      pageSize,
      resolvedVisibleEventCount,
      stream,
      streamsUrl,
    ],
  );
  const collection = useMemo<StreamEventCollection | null>(() => {
    if (!stream || !streamsUrl || !queryScopeKey) {
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
                startExclusiveSequence: window.startExclusiveSequence,
                stream,
              });
            },
            queryKey: () => [
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
            ],
            retry: false,
            staleTime: Infinity,
          }),
        ),
    );
  }, [
    normalizedPageCount,
    pageSize,
    queryClient,
    queryScopeKey,
    resolvedVisibleEventCount,
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
  const isFetching = isLoading || isQueryFetching > 0;

  useEffect(() => {
    if (!stream) {
      lastResolvedEventsRef.current = null;
      return;
    }

    const currentResolvedState = lastResolvedEventsRef.current;

    if (
      currentResolvedState &&
      (currentResolvedState.streamName !== stream.name ||
        currentResolvedState.epoch !== stream.epoch)
    ) {
      lastResolvedEventsRef.current = null;
    }

    if (events.length === 0) {
      return;
    }

    lastResolvedEventsRef.current = {
      epoch: stream.epoch,
      events,
      streamName: stream.name,
    };
  }, [events, stream]);

  const visibleEvents =
    stream &&
    isFetching &&
    events.length === 0 &&
    lastResolvedEventsRef.current?.streamName === stream.name &&
    lastResolvedEventsRef.current?.epoch === stream.epoch
      ? lastResolvedEventsRef.current.events
      : events;

  const refetch = useCallback(async () => {
    if (!collection) {
      return;
    }

    await (collection as RefetchableStreamEventCollection).utils.refetch({
      throwOnError: true,
    });
  }, [collection]);

  return {
    collection,
    events: visibleEvents,
    hasHiddenNewerEvents: latestEventCount > resolvedVisibleEventCount,
    hasMoreEvents: BigInt(visibleEvents.length) < window.totalEventCount,
    hiddenNewerEventCount:
      latestEventCount > resolvedVisibleEventCount
        ? latestEventCount - resolvedVisibleEventCount
        : 0n,
    isFetching,
    pageSize,
    queryScopeKey,
    refetch,
    totalEventCount: latestEventCount,
    visibleEventCount: resolvedVisibleEventCount,
  };
}
