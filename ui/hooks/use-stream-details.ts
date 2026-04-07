import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { useStudio } from "../studio/context";
import type { StudioStream } from "./use-streams";

interface StreamDetailsApiPayload {
  index_status?: {
    bundled_companions?: {
      bytes_at_rest?: unknown;
      fully_indexed_uploaded_segments?: unknown;
      object_count?: unknown;
    };
    desired_index_plan_generation?: unknown;
    exact_indexes?: unknown[];
    manifest?: {
      generation?: unknown;
      last_uploaded_at?: unknown;
      last_uploaded_etag?: unknown;
      last_uploaded_size_bytes?: unknown;
      uploaded_generation?: unknown;
    };
    profile?: unknown;
    routing_key_index?: {
      active_run_count?: unknown;
      bytes_at_rest?: unknown;
      configured?: unknown;
      fully_indexed_uploaded_segments?: unknown;
      indexed_segment_count?: unknown;
      lag_ms?: unknown;
      lag_segments?: unknown;
      object_count?: unknown;
      retired_run_count?: unknown;
      updated_at?: unknown;
    };
    routing_key_lexicon?: {
      active_run_count?: unknown;
      bytes_at_rest?: unknown;
      configured?: unknown;
      fully_indexed_uploaded_segments?: unknown;
      indexed_segment_count?: unknown;
      lag_ms?: unknown;
      lag_segments?: unknown;
      object_count?: unknown;
      retired_run_count?: unknown;
      updated_at?: unknown;
    };
    search_families?: unknown[];
    segments?: {
      total_count?: unknown;
      uploaded_count?: unknown;
    };
    stream?: unknown;
  };
  object_store_requests?: {
    by_artifact?: unknown[];
    deletes?: unknown;
    gets?: unknown;
    heads?: unknown;
    lists?: unknown;
    puts?: unknown;
    reads?: unknown;
  };
  schema?: {
    routingKey?: {
      jsonPointer?: unknown;
      required?: unknown;
    };
    search?: {
      aliases?: Record<string, unknown>;
      defaultFields?: unknown[];
      fields?: Record<string, unknown>;
      primaryTimestampField?: unknown;
      rollups?: Record<string, unknown>;
    };
  };
  storage?: {
    companion_families?: {
      agg_bytes?: unknown;
      col_bytes?: unknown;
      fts_bytes?: unknown;
      mblk_bytes?: unknown;
    };
    local_storage?: {
      exact_index_cache_bytes?: unknown;
      lexicon_index_cache_bytes?: unknown;
      pending_sealed_segment_bytes?: unknown;
      pending_tail_bytes?: unknown;
      routing_index_cache_bytes?: unknown;
      segment_cache_bytes?: unknown;
      sqlite_shared_total_bytes?: unknown;
      total_bytes?: unknown;
      wal_retained_bytes?: unknown;
    };
    object_storage?: {
      bundled_companion_object_count?: unknown;
      exact_index_object_count?: unknown;
      indexes_bytes?: unknown;
      manifest_and_meta_bytes?: unknown;
      manifest_bytes?: unknown;
      routing_index_object_count?: unknown;
      routing_lexicon_object_count?: unknown;
      schema_registry_bytes?: unknown;
      segment_object_count?: unknown;
      segments_bytes?: unknown;
      total_bytes?: unknown;
    };
  };
  stream: {
    content_type?: string;
    created_at: string;
    epoch: number;
    expires_at: string | null;
    last_append_at?: string | null;
    last_segment_cut_at?: string | null;
    name: string;
    next_offset: string;
    pending_bytes?: string;
    pending_rows?: string;
    sealed_through: string;
    segment_count?: number;
    total_size_bytes: string;
    uploaded_segment_count?: number;
    uploaded_through: string;
    wal_bytes?: string;
  };
}

interface StreamsServerDetailsApiPayload {
  configured_limits?: {
    caches?: {
      companion_file_cache_bytes?: unknown;
      companion_section_cache_bytes?: unknown;
      companion_toc_cache_bytes?: unknown;
      index_run_disk_cache_bytes?: unknown;
      index_run_memory_cache_bytes?: unknown;
      segment_cache_bytes?: unknown;
      sqlite_cache_bytes?: unknown;
      worker_sqlite_cache_bytes?: unknown;
    };
  };
}

export type StudioStreamAggregationMeasureKind =
  | "count"
  | "summary"
  | "summary_parts";
export type StudioStreamSearchFieldKind =
  | "bool"
  | "date"
  | "float"
  | "integer"
  | "keyword"
  | "text";

export interface StudioStreamAggregationRollupMeasure {
  kind: StudioStreamAggregationMeasureKind;
  name: string;
}

export interface StudioStreamAggregationRollup {
  dimensions: string[];
  intervals: string[];
  measures: StudioStreamAggregationRollupMeasure[];
  name: string;
}

export interface StudioStreamSearchFieldBinding {
  jsonPointer: string;
  version: number;
}

export interface StudioStreamSearchDefaultField {
  boost?: number;
  field: string;
}

export interface StudioStreamSearchField {
  aggregatable: boolean;
  bindings: StudioStreamSearchFieldBinding[];
  column: boolean;
  exact: boolean;
  exists: boolean;
  kind: StudioStreamSearchFieldKind;
  positions: boolean;
  prefix: boolean;
  sortable: boolean;
}

export interface StudioStreamRoutingKeyConfig {
  jsonPointer: string;
  required: boolean;
}

export interface StudioStreamSearchConfig {
  aliases: Record<string, string>;
  defaultFields: StudioStreamSearchDefaultField[];
  fields: Record<string, StudioStreamSearchField>;
  primaryTimestampField: string;
}

export interface StudioStreamRoutingKeyIndexStatus {
  activeRunCount: number;
  bytesAtRest: bigint;
  configured: boolean;
  fullyIndexedUploadedSegments: boolean;
  indexedSegmentCount: number;
  lagMs: bigint | null;
  lagSegments: number;
  objectCount: number;
  retiredRunCount: number;
  updatedAt: string | null;
}

export type StudioStreamRoutingKeyLexiconStatus =
  StudioStreamRoutingKeyIndexStatus;

export interface StudioStreamExactIndexStatus {
  activeRunCount: number;
  bytesAtRest: bigint;
  fullyIndexedUploadedSegments: boolean;
  indexedSegmentCount: number;
  kind: string;
  lagMs: bigint | null;
  lagSegments: number;
  name: string;
  objectCount: number;
  retiredRunCount: number;
  staleConfiguration: boolean;
  updatedAt: string | null;
}

export interface StudioStreamSearchFamilyStatus {
  bytesAtRest: bigint;
  contiguousCoveredSegmentCount: number;
  coveredSegmentCount: number;
  family: string;
  fields: string[];
  fullyIndexedUploadedSegments: boolean;
  lagMs: bigint | null;
  lagSegments: number;
  objectCount: number;
  planGeneration: number;
  staleSegmentCount: number;
  updatedAt: string | null;
}

export interface StudioStreamManifestStatus {
  generation: number;
  lastUploadedAt: string | null;
  lastUploadedEtag: string | null;
  lastUploadedSizeBytes: bigint;
  uploadedGeneration: number;
}

export interface StudioStreamBundledCompanionsStatus {
  bytesAtRest: bigint;
  fullyIndexedUploadedSegments: boolean;
  objectCount: number;
}

export interface StudioStreamIndexStatus {
  bundledCompanions: StudioStreamBundledCompanionsStatus;
  desiredIndexPlanGeneration: number;
  exactIndexes: StudioStreamExactIndexStatus[];
  manifest: StudioStreamManifestStatus;
  profile: string | null;
  routingKeyIndex: StudioStreamRoutingKeyIndexStatus | null;
  routingKeyLexicon: StudioStreamRoutingKeyLexiconStatus | null;
  searchFamilies: StudioStreamSearchFamilyStatus[];
  segments: {
    totalCount: number;
    uploadedCount: number;
  };
  stream: string | null;
}

export interface StudioStreamObjectStorageBreakdown {
  bundledCompanionObjectCount: number;
  exactIndexObjectCount: number;
  indexesBytes: bigint;
  manifestAndMetaBytes: bigint;
  manifestBytes: bigint;
  routingIndexObjectCount: number;
  routingLexiconObjectCount: number;
  schemaRegistryBytes: bigint;
  segmentObjectCount: number;
  segmentsBytes: bigint;
  totalBytes: bigint;
}

export interface StudioStreamLocalStorageBreakdown {
  companionCacheBytes: bigint;
  exactIndexCacheBytes: bigint;
  lexiconIndexCacheBytes: bigint;
  pendingSealedSegmentBytes: bigint;
  pendingTailBytes: bigint;
  routingIndexCacheBytes: bigint;
  segmentCacheBytes: bigint;
  sqliteSharedTotalBytes: bigint;
  totalBytes: bigint;
  walRetainedBytes: bigint;
}

export interface StudioStreamCompanionFamilyBreakdown {
  aggBytes: bigint;
  colBytes: bigint;
  ftsBytes: bigint;
  mblkBytes: bigint;
}

export interface StudioStreamStorageBreakdown {
  companionFamilies: StudioStreamCompanionFamilyBreakdown;
  localStorage: StudioStreamLocalStorageBreakdown;
  objectStorage: StudioStreamObjectStorageBreakdown;
}

export interface StudioStreamObjectStoreRequestBreakdownEntry {
  artifact: string;
  deletes: bigint;
  gets: bigint;
  heads: bigint;
  lists: bigint;
  puts: bigint;
  reads: bigint;
}

export interface StudioStreamObjectStoreRequestSummary {
  byArtifact: StudioStreamObjectStoreRequestBreakdownEntry[];
  deletes: bigint;
  gets: bigint;
  heads: bigint;
  lists: bigint;
  puts: bigint;
  reads: bigint;
}

export interface StudioStreamsServerCacheLimits {
  companionFileCacheBytes: bigint;
  companionSectionCacheBytes: bigint;
  companionTocCacheBytes: bigint;
  indexRunDiskCacheBytes: bigint;
  indexRunMemoryCacheBytes: bigint;
  segmentCacheBytes: bigint;
  sqliteCacheBytes: bigint;
  workerSqliteCacheBytes: bigint;
}

export interface StudioStreamsServerConfiguredLimits {
  caches: StudioStreamsServerCacheLimits;
}

export interface StudioStreamDetails extends StudioStream {
  aggregationCount: number;
  aggregationRollups: StudioStreamAggregationRollup[];
  contentType: string | null;
  indexStatus: StudioStreamIndexStatus | null;
  lastAppendAt: string | null;
  lastSegmentCutAt: string | null;
  pendingBytes: bigint;
  pendingRows: bigint;
  objectStoreRequests: StudioStreamObjectStoreRequestSummary | null;
  routingKey: StudioStreamRoutingKeyConfig | null;
  serverConfiguredLimits: StudioStreamsServerConfiguredLimits | null;
  search: StudioStreamSearchConfig | null;
  segmentCount: number;
  storage: StudioStreamStorageBreakdown | null;
  totalSizeBytes: bigint;
  uploadedSegmentCount: number;
  walBytes: bigint;
}

export interface UseStreamDetailsArgs {
  refreshIntervalMs?: number;
  shouldEnableLongPolling?: (details: StudioStreamDetails) => boolean;
  streamName?: string | null;
}

interface StreamDetailsQueryData {
  details: StudioStreamDetails;
  etag: string | null;
}

type StreamDetailsQueryKey = ["stream-details", string];
type StreamsServerDetailsQueryKey = ["streams-server-details", string];

const STREAM_DETAILS_LONG_POLL_TIMEOUT = "30s";
const STREAM_DETAILS_LONG_POLL_RETRY_DELAY_MS = 1_000;

function parseNonNegativeBigInt(value: unknown): bigint {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint" &&
    typeof value !== "boolean"
  ) {
    return 0n;
  }

  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

function parseNullableBigInt(value: unknown): bigint | null {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint" &&
    typeof value !== "boolean"
  ) {
    return null;
  }

  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : 0n;
  } catch {
    return null;
  }
}

function parseNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

function parseNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStreamDetailsApiPayload(
  value: unknown,
): value is StreamDetailsApiPayload {
  if (!isRecord(value)) {
    return false;
  }

  const payload = value as Partial<StreamDetailsApiPayload>;
  const stream = payload.stream;

  return (
    typeof stream === "object" &&
    stream !== null &&
    typeof stream.created_at === "string" &&
    typeof stream.epoch === "number" &&
    (stream.expires_at === null || typeof stream.expires_at === "string") &&
    typeof stream.name === "string" &&
    typeof stream.next_offset === "string" &&
    typeof stream.sealed_through === "string" &&
    typeof stream.total_size_bytes === "string" &&
    typeof stream.uploaded_through === "string"
  );
}

function isStreamsServerDetailsApiPayload(
  value: unknown,
): value is StreamsServerDetailsApiPayload {
  return isRecord(value);
}

function normalizeAggregationRollups(
  value: unknown,
): StudioStreamAggregationRollup[] {
  if (!isRecord(value)) {
    return [];
  }

  const rollups = Object.entries(value)
    .map(([rollupName, rollupValue]) => {
      if (!isRecord(rollupValue)) {
        return null;
      }

      const intervals = Array.isArray(rollupValue.intervals)
        ? rollupValue.intervals.filter(
            (interval): interval is string => typeof interval === "string",
          )
        : [];
      const dimensions = Array.isArray(rollupValue.dimensions)
        ? rollupValue.dimensions.filter(
            (dimension): dimension is string => typeof dimension === "string",
          )
        : [];
      const measuresRecord = isRecord(rollupValue.measures)
        ? rollupValue.measures
        : null;

      if (!measuresRecord) {
        return null;
      }

      const measures = Object.entries(measuresRecord)
        .map(([measureName, measureValue]) => {
          if (!isRecord(measureValue)) {
            return null;
          }

          const kind = measureValue.kind;

          if (
            kind !== "count" &&
            kind !== "summary" &&
            kind !== "summary_parts"
          ) {
            return null;
          }

          return {
            kind,
            name: measureName,
          } satisfies StudioStreamAggregationRollupMeasure;
        })
        .filter(
          (measure): measure is StudioStreamAggregationRollupMeasure =>
            measure !== null,
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      if (intervals.length === 0 || measures.length === 0) {
        return null;
      }

      return {
        dimensions,
        intervals: [...intervals].sort((left, right) =>
          left.localeCompare(right),
        ),
        measures,
        name: rollupName,
      } satisfies StudioStreamAggregationRollup;
    })
    .filter(
      (rollup): rollup is StudioStreamAggregationRollup => rollup !== null,
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  return rollups;
}

function normalizeSearchFieldBindings(
  value: unknown,
): StudioStreamSearchFieldBinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((binding) => {
      if (!isRecord(binding)) {
        return null;
      }

      if (
        typeof binding.jsonPointer !== "string" ||
        typeof binding.version !== "number"
      ) {
        return null;
      }

      return {
        jsonPointer: binding.jsonPointer,
        version: binding.version,
      } satisfies StudioStreamSearchFieldBinding;
    })
    .filter(
      (binding): binding is StudioStreamSearchFieldBinding => binding !== null,
    )
    .sort((left, right) => left.version - right.version);
}

function normalizeSearchFields(
  value: unknown,
): Record<string, StudioStreamSearchField> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([fieldName, fieldValue]) => {
        if (!isRecord(fieldValue)) {
          return null;
        }

        const kind = fieldValue.kind;

        if (
          kind !== "bool" &&
          kind !== "date" &&
          kind !== "float" &&
          kind !== "integer" &&
          kind !== "keyword" &&
          kind !== "text"
        ) {
          return null;
        }

        const bindings = normalizeSearchFieldBindings(fieldValue.bindings);

        if (bindings.length === 0) {
          return null;
        }

        return [
          fieldName,
          {
            aggregatable: fieldValue.aggregatable === true,
            bindings,
            column: fieldValue.column === true,
            exact: fieldValue.exact === true,
            exists: fieldValue.exists === true,
            kind,
            positions: fieldValue.positions === true,
            prefix: fieldValue.prefix === true,
            sortable: fieldValue.sortable === true,
          } satisfies StudioStreamSearchField,
        ] as const;
      })
      .filter(
        (entry): entry is readonly [string, StudioStreamSearchField] =>
          entry !== null,
      ),
  );
}

function normalizeSearchAliases(
  value: unknown,
  fields: Record<string, StudioStreamSearchField>,
): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([alias, fieldName]) => {
        if (typeof fieldName !== "string" || !fields[fieldName]) {
          return null;
        }

        return [alias, fieldName] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );
}

function normalizeSearchDefaultFields(
  value: unknown,
  fields: Record<string, StudioStreamSearchField>,
): StudioStreamSearchDefaultField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((defaultField) => {
    if (!isRecord(defaultField) || typeof defaultField.field !== "string") {
      return [];
    }

    if (!fields[defaultField.field]) {
      return [];
    }

    return [
      {
        ...(typeof defaultField.boost === "number" &&
        Number.isFinite(defaultField.boost)
          ? { boost: defaultField.boost }
          : {}),
        field: defaultField.field,
      } satisfies StudioStreamSearchDefaultField,
    ];
  });
}

function normalizeSearchConfig(
  value: unknown,
): StudioStreamSearchConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const fields = normalizeSearchFields(value.fields);

  if (Object.keys(fields).length === 0) {
    return null;
  }

  const primaryTimestampField =
    typeof value.primaryTimestampField === "string" &&
    fields[value.primaryTimestampField]
      ? value.primaryTimestampField
      : null;

  if (!primaryTimestampField) {
    return null;
  }

  return {
    aliases: normalizeSearchAliases(value.aliases, fields),
    defaultFields: normalizeSearchDefaultFields(value.defaultFields, fields),
    fields,
    primaryTimestampField,
  };
}

function normalizeRoutingKeyConfig(
  value: unknown,
): StudioStreamRoutingKeyConfig | null {
  if (!isRecord(value) || typeof value.jsonPointer !== "string") {
    return null;
  }

  return {
    jsonPointer: value.jsonPointer,
    required: value.required === true,
  };
}

function normalizeRoutingKeyIndexStatus(
  value: unknown,
): StudioStreamRoutingKeyIndexStatus | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    activeRunCount: parseNonNegativeInteger(value.active_run_count),
    bytesAtRest: parseNonNegativeBigInt(value.bytes_at_rest),
    configured: value.configured === true,
    fullyIndexedUploadedSegments:
      value.fully_indexed_uploaded_segments === true,
    indexedSegmentCount: parseNonNegativeInteger(value.indexed_segment_count),
    lagMs: parseNullableBigInt(value.lag_ms),
    lagSegments: parseNonNegativeInteger(value.lag_segments),
    objectCount: parseNonNegativeInteger(value.object_count),
    retiredRunCount: parseNonNegativeInteger(value.retired_run_count),
    updatedAt: parseNullableString(value.updated_at),
  };
}

function normalizeExactIndexes(value: unknown): StudioStreamExactIndexStatus[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.name !== "string") {
        return null;
      }

      return {
        activeRunCount: parseNonNegativeInteger(entry.active_run_count),
        bytesAtRest: parseNonNegativeBigInt(entry.bytes_at_rest),
        fullyIndexedUploadedSegments:
          entry.fully_indexed_uploaded_segments === true,
        indexedSegmentCount: parseNonNegativeInteger(
          entry.indexed_segment_count,
        ),
        kind: typeof entry.kind === "string" ? entry.kind : "unknown",
        lagMs: parseNullableBigInt(entry.lag_ms),
        lagSegments: parseNonNegativeInteger(entry.lag_segments),
        name: entry.name,
        objectCount: parseNonNegativeInteger(entry.object_count),
        retiredRunCount: parseNonNegativeInteger(entry.retired_run_count),
        staleConfiguration: entry.stale_configuration === true,
        updatedAt: parseNullableString(entry.updated_at),
      } satisfies StudioStreamExactIndexStatus;
    })
    .filter((entry): entry is StudioStreamExactIndexStatus => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeSearchFamilies(
  value: unknown,
): StudioStreamSearchFamilyStatus[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.family !== "string") {
        return null;
      }

      const fields = Array.isArray(entry.fields)
        ? entry.fields.filter(
            (field): field is string => typeof field === "string",
          )
        : [];

      return {
        bytesAtRest: parseNonNegativeBigInt(entry.bytes_at_rest),
        contiguousCoveredSegmentCount: parseNonNegativeInteger(
          entry.contiguous_covered_segment_count,
        ),
        coveredSegmentCount: parseNonNegativeInteger(
          entry.covered_segment_count,
        ),
        family: entry.family,
        fields,
        fullyIndexedUploadedSegments:
          entry.fully_indexed_uploaded_segments === true,
        lagMs: parseNullableBigInt(entry.lag_ms),
        lagSegments: parseNonNegativeInteger(entry.lag_segments),
        objectCount: parseNonNegativeInteger(entry.object_count),
        planGeneration: parseNonNegativeInteger(entry.plan_generation),
        staleSegmentCount: parseNonNegativeInteger(entry.stale_segment_count),
        updatedAt: parseNullableString(entry.updated_at),
      } satisfies StudioStreamSearchFamilyStatus;
    })
    .filter((entry): entry is StudioStreamSearchFamilyStatus => entry !== null)
    .sort((left, right) => left.family.localeCompare(right.family));
}

function normalizeIndexStatus(value: unknown): StudioStreamIndexStatus | null {
  if (!isRecord(value)) {
    return null;
  }

  const manifest = isRecord(value.manifest) ? value.manifest : null;
  const bundledCompanions = isRecord(value.bundled_companions)
    ? value.bundled_companions
    : null;
  const segments = isRecord(value.segments) ? value.segments : null;

  return {
    bundledCompanions: {
      bytesAtRest: parseNonNegativeBigInt(bundledCompanions?.bytes_at_rest),
      fullyIndexedUploadedSegments:
        bundledCompanions?.fully_indexed_uploaded_segments === true,
      objectCount: parseNonNegativeInteger(bundledCompanions?.object_count),
    },
    desiredIndexPlanGeneration: parseNonNegativeInteger(
      value.desired_index_plan_generation,
    ),
    exactIndexes: normalizeExactIndexes(value.exact_indexes),
    manifest: {
      generation: parseNonNegativeInteger(manifest?.generation),
      lastUploadedAt: parseNullableString(manifest?.last_uploaded_at),
      lastUploadedEtag: parseNullableString(manifest?.last_uploaded_etag),
      lastUploadedSizeBytes: parseNonNegativeBigInt(
        manifest?.last_uploaded_size_bytes,
      ),
      uploadedGeneration: parseNonNegativeInteger(
        manifest?.uploaded_generation,
      ),
    },
    profile: parseNullableString(value.profile),
    routingKeyIndex: normalizeRoutingKeyIndexStatus(value.routing_key_index),
    routingKeyLexicon: normalizeRoutingKeyIndexStatus(
      value.routing_key_lexicon,
    ),
    searchFamilies: normalizeSearchFamilies(value.search_families),
    segments: {
      totalCount: parseNonNegativeInteger(segments?.total_count),
      uploadedCount: parseNonNegativeInteger(segments?.uploaded_count),
    },
    stream: parseNullableString(value.stream),
  };
}

function normalizeStorageBreakdown(
  value: unknown,
): StudioStreamStorageBreakdown | null {
  if (!isRecord(value)) {
    return null;
  }

  const objectStorage = isRecord(value.object_storage)
    ? value.object_storage
    : null;
  const localStorage = isRecord(value.local_storage)
    ? value.local_storage
    : null;
  const companionFamilies = isRecord(value.companion_families)
    ? value.companion_families
    : null;

  return {
    companionFamilies: {
      aggBytes: parseNonNegativeBigInt(companionFamilies?.agg_bytes),
      colBytes: parseNonNegativeBigInt(companionFamilies?.col_bytes),
      ftsBytes: parseNonNegativeBigInt(companionFamilies?.fts_bytes),
      mblkBytes: parseNonNegativeBigInt(companionFamilies?.mblk_bytes),
    },
    localStorage: {
      companionCacheBytes: parseNonNegativeBigInt(
        localStorage?.companion_cache_bytes,
      ),
      exactIndexCacheBytes: parseNonNegativeBigInt(
        localStorage?.exact_index_cache_bytes,
      ),
      lexiconIndexCacheBytes: parseNonNegativeBigInt(
        localStorage?.lexicon_index_cache_bytes,
      ),
      pendingSealedSegmentBytes: parseNonNegativeBigInt(
        localStorage?.pending_sealed_segment_bytes,
      ),
      pendingTailBytes: parseNonNegativeBigInt(
        localStorage?.pending_tail_bytes,
      ),
      routingIndexCacheBytes: parseNonNegativeBigInt(
        localStorage?.routing_index_cache_bytes,
      ),
      segmentCacheBytes: parseNonNegativeBigInt(
        localStorage?.segment_cache_bytes,
      ),
      sqliteSharedTotalBytes: parseNonNegativeBigInt(
        localStorage?.sqlite_shared_total_bytes,
      ),
      totalBytes: parseNonNegativeBigInt(localStorage?.total_bytes),
      walRetainedBytes: parseNonNegativeBigInt(
        localStorage?.wal_retained_bytes,
      ),
    },
    objectStorage: {
      bundledCompanionObjectCount: parseNonNegativeInteger(
        objectStorage?.bundled_companion_object_count,
      ),
      exactIndexObjectCount: parseNonNegativeInteger(
        objectStorage?.exact_index_object_count,
      ),
      indexesBytes: parseNonNegativeBigInt(objectStorage?.indexes_bytes),
      manifestAndMetaBytes: parseNonNegativeBigInt(
        objectStorage?.manifest_and_meta_bytes,
      ),
      manifestBytes: parseNonNegativeBigInt(objectStorage?.manifest_bytes),
      routingIndexObjectCount: parseNonNegativeInteger(
        objectStorage?.routing_index_object_count,
      ),
      routingLexiconObjectCount: parseNonNegativeInteger(
        objectStorage?.routing_lexicon_object_count,
      ),
      schemaRegistryBytes: parseNonNegativeBigInt(
        objectStorage?.schema_registry_bytes,
      ),
      segmentObjectCount: parseNonNegativeInteger(
        objectStorage?.segment_object_count,
      ),
      segmentsBytes: parseNonNegativeBigInt(objectStorage?.segments_bytes),
      totalBytes: parseNonNegativeBigInt(objectStorage?.total_bytes),
    },
  };
}

function normalizeObjectStoreRequestSummary(
  value: unknown,
): StudioStreamObjectStoreRequestSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const byArtifact = Array.isArray(value.by_artifact)
    ? value.by_artifact
        .map((entry) => {
          if (!isRecord(entry) || typeof entry.artifact !== "string") {
            return null;
          }

          return {
            artifact: entry.artifact,
            deletes: parseNonNegativeBigInt(entry.deletes),
            gets: parseNonNegativeBigInt(entry.gets),
            heads: parseNonNegativeBigInt(entry.heads),
            lists: parseNonNegativeBigInt(entry.lists),
            puts: parseNonNegativeBigInt(entry.puts),
            reads: parseNonNegativeBigInt(entry.reads),
          } satisfies StudioStreamObjectStoreRequestBreakdownEntry;
        })
        .filter(
          (entry): entry is StudioStreamObjectStoreRequestBreakdownEntry =>
            entry !== null,
        )
        .sort((left, right) => left.artifact.localeCompare(right.artifact))
    : [];

  return {
    byArtifact,
    deletes: parseNonNegativeBigInt(value.deletes),
    gets: parseNonNegativeBigInt(value.gets),
    heads: parseNonNegativeBigInt(value.heads),
    lists: parseNonNegativeBigInt(value.lists),
    puts: parseNonNegativeBigInt(value.puts),
    reads: parseNonNegativeBigInt(value.reads),
  };
}

function normalizeServerConfiguredLimits(
  value: unknown,
): StudioStreamsServerConfiguredLimits | null {
  if (!isRecord(value)) {
    return null;
  }

  const caches = isRecord(value.caches) ? value.caches : null;

  if (!caches) {
    return null;
  }

  return {
    caches: {
      companionFileCacheBytes: parseNonNegativeBigInt(
        caches.companion_file_cache_bytes,
      ),
      companionSectionCacheBytes: parseNonNegativeBigInt(
        caches.companion_section_cache_bytes,
      ),
      companionTocCacheBytes: parseNonNegativeBigInt(
        caches.companion_toc_cache_bytes,
      ),
      indexRunDiskCacheBytes: parseNonNegativeBigInt(
        caches.index_run_disk_cache_bytes,
      ),
      indexRunMemoryCacheBytes: parseNonNegativeBigInt(
        caches.index_run_memory_cache_bytes,
      ),
      segmentCacheBytes: parseNonNegativeBigInt(caches.segment_cache_bytes),
      sqliteCacheBytes: parseNonNegativeBigInt(caches.sqlite_cache_bytes),
      workerSqliteCacheBytes: parseNonNegativeBigInt(
        caches.worker_sqlite_cache_bytes,
      ),
    },
  };
}

function normalizeStreamDetailsPayload(
  payload: StreamDetailsApiPayload,
): StudioStreamDetails {
  const aggregationRollups = normalizeAggregationRollups(
    payload.schema?.search?.rollups,
  );
  const routingKey = normalizeRoutingKeyConfig(payload.schema?.routingKey);
  const search = normalizeSearchConfig(payload.schema?.search);
  const indexStatus = normalizeIndexStatus(payload.index_status);
  const storage = normalizeStorageBreakdown(payload.storage);
  const objectStoreRequests = normalizeObjectStoreRequestSummary(
    payload.object_store_requests,
  );

  return {
    aggregationCount: aggregationRollups.length,
    aggregationRollups,
    contentType:
      typeof payload.stream.content_type === "string"
        ? payload.stream.content_type
        : null,
    createdAt: payload.stream.created_at,
    epoch: payload.stream.epoch,
    expiresAt: payload.stream.expires_at,
    indexStatus,
    lastAppendAt: parseNullableString(payload.stream.last_append_at),
    lastSegmentCutAt: parseNullableString(payload.stream.last_segment_cut_at),
    name: payload.stream.name,
    nextOffset: payload.stream.next_offset,
    objectStoreRequests,
    pendingBytes: parseNonNegativeBigInt(payload.stream.pending_bytes ?? "0"),
    pendingRows: parseNonNegativeBigInt(payload.stream.pending_rows ?? "0"),
    routingKey,
    serverConfiguredLimits: null,
    search,
    sealedThrough: payload.stream.sealed_through,
    segmentCount:
      parseNonNegativeInteger(payload.stream.segment_count) ||
      indexStatus?.segments.totalCount ||
      0,
    storage,
    totalSizeBytes: parseNonNegativeBigInt(payload.stream.total_size_bytes),
    uploadedSegmentCount:
      parseNonNegativeInteger(payload.stream.uploaded_segment_count) ||
      indexStatus?.segments.uploadedCount ||
      0,
    uploadedThrough: payload.stream.uploaded_through,
    walBytes: parseNonNegativeBigInt(payload.stream.wal_bytes ?? "0"),
  };
}

function createStreamDetailsUrl(
  streamsUrl: string | undefined,
  streamName: string | null | undefined,
): string {
  const trimmedStreamsUrl = streamsUrl?.trim();
  const trimmedStreamName = streamName?.trim();

  if (!trimmedStreamsUrl || !trimmedStreamName) {
    return "";
  }

  const encodedStreamName = encodeURIComponent(trimmedStreamName);
  const suffix = `/v1/stream/${encodedStreamName}/_details`;

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

function createStreamsServerDetailsUrl(streamsUrl: string | undefined): string {
  const trimmedStreamsUrl = streamsUrl?.trim();

  if (!trimmedStreamsUrl) {
    return "";
  }

  const suffix = "/v1/server/_details";

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

function createStreamDetailsLongPollUrl(detailsUrl: string): string {
  try {
    const url = new URL(detailsUrl);

    url.searchParams.set("live", "long-poll");
    url.searchParams.set("timeout", STREAM_DETAILS_LONG_POLL_TIMEOUT);

    return url.toString();
  } catch {
    const separator = detailsUrl.includes("?") ? "&" : "?";

    return `${detailsUrl}${separator}live=long-poll&timeout=${STREAM_DETAILS_LONG_POLL_TIMEOUT}`;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

async function waitForLongPollRetry(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    };

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function parseStreamDetailsResponse(args: {
  fallbackEtag?: string | null;
  response: Response;
}): Promise<StreamDetailsQueryData> {
  const { fallbackEtag = null, response } = args;

  if (!response.ok) {
    throw new Error(
      `Failed loading stream details (${response.status} ${response.statusText})`,
    );
  }

  const payload = (await response.json()) as unknown;

  if (!isStreamDetailsApiPayload(payload)) {
    throw new Error(
      "Streams server returned an invalid stream details response shape.",
    );
  }

  return {
    details: normalizeStreamDetailsPayload(payload),
    etag: response.headers.get("etag") ?? fallbackEtag,
  };
}

async function parseStreamsServerDetailsResponse(
  response: Response,
): Promise<StudioStreamsServerConfiguredLimits | null> {
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;

  if (!isStreamsServerDetailsApiPayload(payload)) {
    return null;
  }

  return normalizeServerConfiguredLimits(payload.configured_limits);
}

export function useStreamDetails(args?: UseStreamDetailsArgs) {
  const { streamsUrl } = useStudio();
  const queryClient = useQueryClient();
  const longPollEtagRef = useRef<string | null>(null);
  const detailsUrl = useMemo(
    () => createStreamDetailsUrl(streamsUrl, args?.streamName),
    [args?.streamName, streamsUrl],
  );
  const serverDetailsUrl = useMemo(
    () => createStreamsServerDetailsUrl(streamsUrl),
    [streamsUrl],
  );
  const refreshIntervalMs = args?.refreshIntervalMs;
  const shouldEnableLongPolling = args?.shouldEnableLongPolling;
  const isLongPollingEnabled =
    typeof refreshIntervalMs === "number" && refreshIntervalMs > 0;
  const longPollUrl = useMemo(
    () => (detailsUrl ? createStreamDetailsLongPollUrl(detailsUrl) : ""),
    [detailsUrl],
  );
  const queryKey = useMemo(
    (): StreamDetailsQueryKey => ["stream-details", detailsUrl],
    [detailsUrl],
  );
  const serverDetailsQueryKey = useMemo(
    (): StreamsServerDetailsQueryKey => [
      "streams-server-details",
      serverDetailsUrl,
    ],
    [serverDetailsUrl],
  );
  const query = useQuery<
    StreamDetailsQueryData,
    Error,
    StreamDetailsQueryData,
    StreamDetailsQueryKey
  >({
    enabled: detailsUrl.length > 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(detailsUrl, { signal });

      return await parseStreamDetailsResponse({ response });
    },
    queryKey,
    refetchInterval: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    retryOnMount: false,
    staleTime: Infinity,
  });
  const serverDetailsQuery = useQuery<
    StudioStreamsServerConfiguredLimits | null,
    Error,
    StudioStreamsServerConfiguredLimits | null,
    StreamsServerDetailsQueryKey
  >({
    enabled: detailsUrl.length > 0 && serverDetailsUrl.length > 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(serverDetailsUrl, { signal });

      return await parseStreamsServerDetailsResponse(response);
    },
    queryKey: serverDetailsQueryKey,
    refetchInterval: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    retryOnMount: false,
    staleTime: Infinity,
  });

  const resolvedQueryData = query.data ?? null;
  const resolvedServerConfiguredLimits = serverDetailsQuery.data ?? null;
  const isLongPollingEnabledForResolvedDetails =
    resolvedQueryData == null
      ? shouldEnableLongPolling == null
      : (shouldEnableLongPolling?.(resolvedQueryData.details) ?? true);
  const mergedQueryData = useMemo(() => {
    if (!resolvedQueryData) {
      return null;
    }

    return {
      ...resolvedQueryData,
      details: {
        ...resolvedQueryData.details,
        serverConfiguredLimits: resolvedServerConfiguredLimits,
      },
    } satisfies StreamDetailsQueryData;
  }, [resolvedQueryData, resolvedServerConfiguredLimits]);

  useEffect(() => {
    longPollEtagRef.current = null;
  }, [detailsUrl]);

  useEffect(() => {
    longPollEtagRef.current = resolvedQueryData?.etag ?? null;
  }, [resolvedQueryData?.etag]);

  useEffect(() => {
    if (
      !isLongPollingEnabled ||
      !isLongPollingEnabledForResolvedDetails ||
      !detailsUrl ||
      !longPollUrl ||
      !query.isSuccess ||
      !longPollEtagRef.current
    ) {
      return;
    }

    let isActive = true;
    let abortController: AbortController | null = null;
    const retryDelayMs = Math.max(
      refreshIntervalMs ?? STREAM_DETAILS_LONG_POLL_RETRY_DELAY_MS,
      STREAM_DETAILS_LONG_POLL_RETRY_DELAY_MS,
    );

    const runLongPollLoop = async () => {
      while (isActive) {
        const currentEtag = longPollEtagRef.current;

        if (!currentEtag) {
          return;
        }

        abortController = new AbortController();

        try {
          const response = await fetch(longPollUrl, {
            headers: { "If-None-Match": currentEtag },
            signal: abortController.signal,
          });

          if (!isActive) {
            return;
          }

          if (response.status === 304) {
            longPollEtagRef.current =
              response.headers.get("etag") ?? currentEtag;
            continue;
          }

          const responseEtag = response.headers.get("etag") ?? currentEtag;

          if (responseEtag === currentEtag) {
            await waitForLongPollRetry(retryDelayMs, abortController.signal);
            continue;
          }

          const nextQueryData = await parseStreamDetailsResponse({
            fallbackEtag: currentEtag,
            response,
          });

          longPollEtagRef.current = nextQueryData.etag ?? currentEtag;
          queryClient.setQueryData(queryKey, nextQueryData);
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }

          await waitForLongPollRetry(retryDelayMs, abortController.signal);
        } finally {
          abortController = null;
        }
      }
    };

    void runLongPollLoop();

    return () => {
      isActive = false;
      abortController?.abort();
    };
  }, [
    detailsUrl,
    isLongPollingEnabledForResolvedDetails,
    isLongPollingEnabled,
    longPollUrl,
    query.isSuccess,
    queryClient,
    queryKey,
    refreshIntervalMs,
  ]);

  return {
    ...query,
    data: mergedQueryData ?? undefined,
    details: mergedQueryData?.details ?? null,
  };
}
