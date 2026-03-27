import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useStudio } from "../studio/context";

interface StreamDetailsApiPayload {
  stream: {
    name: string;
    total_size_bytes: string;
  };
}

export interface StudioStreamDetails {
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

function isStreamDetailsApiPayload(
  value: unknown,
): value is StreamDetailsApiPayload {
  if (typeof value !== "object" || value === null) {
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

      return {
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
