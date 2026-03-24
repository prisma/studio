import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useStudio } from "../studio/context";

const STREAMS_PAGE_SIZE = 1000;

interface StreamsApiItem {
  created_at: string;
  epoch: number;
  expires_at: string | null;
  name: string;
  next_offset: string;
  sealed_through: string;
  uploaded_through: string;
}

export interface StudioStream {
  createdAt: string;
  epoch: number;
  expiresAt: string | null;
  name: string;
  nextOffset: string;
  sealedThrough: string;
  uploadedThrough: string;
}

function isStreamsApiItem(value: unknown): value is StreamsApiItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Partial<StreamsApiItem>;

  return (
    typeof item.created_at === "string" &&
    typeof item.epoch === "number" &&
    (item.expires_at === null || typeof item.expires_at === "string") &&
    typeof item.name === "string" &&
    typeof item.next_offset === "string" &&
    typeof item.sealed_through === "string" &&
    typeof item.uploaded_through === "string"
  );
}

function createStreamsListUrl(streamsUrl: string | undefined): string {
  const trimmed = streamsUrl?.trim();

  if (!trimmed) {
    return "";
  }

  const suffix = `/v1/streams?limit=${STREAMS_PAGE_SIZE}&offset=0`;

  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(/\/+$/, "");

    url.pathname = pathname.endsWith("/v1/streams")
      ? pathname
      : `${pathname}/v1/streams`;
    url.search = `?limit=${STREAMS_PAGE_SIZE}&offset=0`;
    url.hash = "";

    return url.toString();
  } catch {
    const pathname = trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");

    return pathname.endsWith("/v1/streams")
      ? `${pathname}?limit=${STREAMS_PAGE_SIZE}&offset=0`
      : `${pathname}${suffix}`;
  }
}

function sortStreams(streams: StudioStream[]): StudioStream[] {
  return [...streams].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function useStreams() {
  const { streamsUrl } = useStudio();
  const streamsListUrl = useMemo(
    () => createStreamsListUrl(streamsUrl),
    [streamsUrl],
  );
  const hasStreamsServer = streamsListUrl.length > 0;

  const query = useQuery<StudioStream[]>({
    enabled: hasStreamsServer,
    queryFn: async ({ signal }) => {
      const response = await fetch(streamsListUrl, {
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `Failed loading streams (${response.status} ${response.statusText})`,
        );
      }

      const payload = (await response.json()) as unknown;

      if (!Array.isArray(payload) || !payload.every(isStreamsApiItem)) {
        throw new Error("Streams server returned an invalid response shape.");
      }

      return sortStreams(
        payload.map((stream) => ({
          createdAt: stream.created_at,
          epoch: stream.epoch,
          expiresAt: stream.expires_at,
          name: stream.name,
          nextOffset: stream.next_offset,
          sealedThrough: stream.sealed_through,
          uploadedThrough: stream.uploaded_through,
        })),
      );
    },
    queryKey: ["streams", streamsListUrl],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    retryOnMount: false,
    staleTime: Infinity,
  });

  return {
    ...query,
    hasStreamsServer,
    streams: query.data ?? [],
  };
}
