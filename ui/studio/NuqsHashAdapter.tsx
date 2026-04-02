import {
  unstable_AdapterOptions as AdapterOptions,
  unstable_createAdapterProvider as createAdapterProvider,
} from "nuqs/adapters/custom";
import { FC, type PropsWithChildren, useEffect, useMemo } from "react";
export type { default } from "react";

import { useUiState } from "../hooks/use-ui-state";

const HASH_STATE_KEY = "nuqs-hash";

function serializeHashSearchParams(params: URLSearchParams) {
  return params
    .toString()
    .replace(/(^|&)aggregations=(?=&|$)/g, "$1aggregations");
}

/**
 * Simple debounce utility
 */
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Hook that Nuqs will call to read & write URL state.
 */
function useHashAdapter() {
  const rawHash =
    typeof window !== "undefined" ? window.location.hash.slice(1) : "";
  const [storedRawHash, setStoredRawHash] = useUiState<string>(
    HASH_STATE_KEY,
    rawHash,
  );

  const updateHashState = (nextRawHash: string) => {
    setStoredRawHash(nextRawHash);
  };

  useEffect(() => {
    if (storedRawHash === rawHash) {
      return;
    }

    updateHashState(rawHash);
  }, [rawHash, storedRawHash]);

  // write new state back into the hash fragment
  function updateUrl(updated: URLSearchParams, { history }: AdapterOptions) {
    const { pathname, search } = window.location;
    const nextRawHash = serializeHashSearchParams(updated);
    const url = `${pathname}${search}#${nextRawHash}`;

    if (history === "push") {
      window.history.pushState(null, "", url);
    } else {
      window.history.replaceState(null, "", url);
    }

    updateHashState(nextRawHash);
  }

  // expose a snapshot of the current params
  function getSearchParamsSnapshot() {
    if (typeof window === "undefined") {
      return new URLSearchParams();
    }
    const raw = window.location.hash.slice(1);

    return new URLSearchParams(raw);
  }

  // sync state when user navigates via browser controls or external script
  useEffect(() => {
    const handleHashChange = debounce(() => {
      updateHashState(window.location.hash.slice(1));
    }, 50);

    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const searchParams = useMemo(
    () => new URLSearchParams(storedRawHash),
    [storedRawHash],
  );

  return { searchParams, updateUrl, getSearchParamsSnapshot };
}

/**
 * The adapter provider component you wrap your app in.
 */
export const NuqsHashAdapter = createAdapterProvider(
  useHashAdapter,
) as FC<PropsWithChildren>;
