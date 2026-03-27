import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useStudio } from "../studio/context";

interface StreamDetailsApiPayload {
  schema?: {
    search?: {
      rollups?: Record<string, unknown>;
    };
  };
  stream: {
    name: string;
    total_size_bytes: string;
  };
}

export type StudioStreamAggregationMeasureKind =
  | "count"
  | "summary"
  | "summary_parts";

export interface StudioStreamAggregationRollupMeasure {
  kind: StudioStreamAggregationMeasureKind;
  name: string;
}

export interface StudioStreamAggregationRollup {
  intervals: string[];
  measures: StudioStreamAggregationRollupMeasure[];
  name: string;
}

export interface StudioStreamDetails {
  aggregationCount: number;
  aggregationRollups: StudioStreamAggregationRollup[];
  name: string;
  totalSizeBytes: bigint;
}

export interface UseStreamDetailsArgs {
  refreshIntervalMs?: number;
  streamName?: string | null;
}

function parseNonNegativeBigInt(value: string): bigint {
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
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
    typeof stream.name === "string" &&
    typeof stream.total_size_bytes === "string"
  );
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

    url.pathname = `${pathname}/v1/stream/${encodedStreamName}/_details`;
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

export function useStreamDetails(args?: UseStreamDetailsArgs) {
  const { streamsUrl } = useStudio();
  const detailsUrl = useMemo(
    () => createStreamDetailsUrl(streamsUrl, args?.streamName),
    [args?.streamName, streamsUrl],
  );
  const refreshIntervalMs = args?.refreshIntervalMs;

  const query = useQuery<
    StudioStreamDetails,
    Error,
    StudioStreamDetails,
    ["stream-details", string]
  >({
    enabled: detailsUrl.length > 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(detailsUrl, {
        signal,
      });

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

      const aggregationRollups = normalizeAggregationRollups(
        payload.schema?.search?.rollups,
      );

      return {
        aggregationCount: aggregationRollups.reduce(
          (count, rollup) => count + rollup.measures.length,
          0,
        ),
        aggregationRollups,
        name: payload.stream.name,
        totalSizeBytes: parseNonNegativeBigInt(payload.stream.total_size_bytes),
      };
    },
    queryKey: ["stream-details", detailsUrl],
    refetchInterval:
      typeof refreshIntervalMs === "number" && refreshIntervalMs > 0
        ? refreshIntervalMs
        : false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    retryOnMount: false,
    staleTime: Infinity,
  });

  return {
    ...query,
    details: query.data ?? null,
  };
}
