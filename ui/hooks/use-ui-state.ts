import {
  createCollection,
  eq,
  localOnlyCollectionOptions,
  useLiveQuery,
} from "@tanstack/react-db";
import { useCallback, useEffect, useRef, useState } from "react";

import shortUUID from "../lib/short-uuid";
import { useOptionalStudio } from "../studio/context";
import { instrumentTanStackCollectionMutations } from "../studio/tanstack-db-mutation-guard";

type Updater<T> = T | ((previous: T) => T);

export interface UseUiStateOptions {
  cleanupOnUnmount?: boolean;
}

const fallbackUiStateCollection = instrumentTanStackCollectionMutations(
  createCollection(
    localOnlyCollectionOptions<{ id: string; value: unknown }>({
      id: "fallback-ui-local-state",
      getKey(item) {
        return item.id;
      },
      initialData: [],
    }),
  ),
  { collectionName: "fallback-ui-local-state" },
);

function cloneValue<T>(value: T): T {
  if (typeof value !== "object" || value == null) {
    return value;
  }

  try {
    return structuredClone(value);
  } catch (_error) {
    return cloneProxyCompatibleValue(value);
  }
}

function cloneProxyCompatibleValue<T>(
  value: T,
  seen = new WeakMap<object, unknown>(),
): T {
  if (typeof value !== "object" || value == null) {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (Array.isArray(value)) {
    const clonedEntries = value.map<unknown>((entry) =>
      cloneProxyCompatibleValue(entry, seen),
    );
    return clonedEntries as T;
  }

  if (seen.has(value)) {
    return seen.get(value) as T;
  }

  const clone = {} as Record<PropertyKey, unknown>;
  seen.set(value, clone);

  for (const key of Reflect.ownKeys(value)) {
    clone[key] = cloneProxyCompatibleValue(
      (value as Record<PropertyKey, unknown>)[key],
      seen,
    );
  }

  return clone as T;
}

function resolveUpdater<T>(previous: T, updater: Updater<T>): T {
  return typeof updater === "function"
    ? (updater as (previous: T) => T)(previous)
    : updater;
}

export function useStableUiStateKey(prefix: string): string {
  const keyRef = useRef<string | null>(null);

  if (!keyRef.current) {
    keyRef.current = `${prefix}:${shortUUID.generate()}`;
  }

  return keyRef.current;
}

export function useUiState<T>(
  key: string | undefined,
  initialValue: T,
  options: UseUiStateOptions = {},
) {
  const { cleanupOnUnmount = false } = options;
  const [volatileValue, setVolatileValue] = useState<T>(() =>
    cloneValue(initialValue),
  );
  const previousVolatileKeyRef = useRef<string | undefined>(key);
  const studioContext = useOptionalStudio();
  const uiLocalStateCollection =
    (studioContext?.uiLocalStateCollection as typeof fallbackUiStateCollection) ??
    fallbackUiStateCollection;

  const { data: stateRow } = useLiveQuery(
    (q) => {
      if (cleanupOnUnmount || !key) {
        return undefined;
      }

      return q
        .from({ item: uiLocalStateCollection })
        .where(({ item }) => eq(item.id, key))
        .select(({ item }) => ({
          id: item.id,
          value: item.value,
        }))
        .findOne();
    },
    [cleanupOnUnmount, key, uiLocalStateCollection],
  );

  useEffect(() => {
    if (!cleanupOnUnmount) {
      return;
    }

    if (previousVolatileKeyRef.current !== key) {
      previousVolatileKeyRef.current = key;
      setVolatileValue(cloneValue(initialValue));
      return;
    }

    // Keep local volatile state aligned when initial value changes
    // while the key remains stable.
    setVolatileValue((previous) => {
      if (Object.is(previous, initialValue)) {
        return previous;
      }

      return cloneValue(initialValue);
    });
  }, [cleanupOnUnmount, initialValue, key]);

  const setVolatileStateValue = useCallback((updater: Updater<T>) => {
    setVolatileValue((previous) =>
      cloneValue(resolveUpdater(previous, updater)),
    );
  }, []);

  const resetVolatileStateValue = useCallback(() => {
    setVolatileValue(cloneValue(initialValue));
  }, [initialValue]);

  useEffect(() => {
    if (cleanupOnUnmount) {
      return;
    }

    if (!key) {
      return;
    }

    if (uiLocalStateCollection.has(key)) {
      return;
    }

    uiLocalStateCollection.insert({
      id: key,
      value: cloneValue(initialValue),
    });
  }, [cleanupOnUnmount, initialValue, key, uiLocalStateCollection]);

  const setValue = useCallback(
    (updater: Updater<T>) => {
      if (cleanupOnUnmount) {
        setVolatileStateValue(updater);
        return;
      }

      if (!key) {
        return;
      }

      const existing = uiLocalStateCollection.get(key);

      if (!existing) {
        uiLocalStateCollection.insert({
          id: key,
          value: cloneValue(resolveUpdater(cloneValue(initialValue), updater)),
        });
        return;
      }

      uiLocalStateCollection.update(key, (draft) => {
        const previous = cloneValue(draft.value as T);
        draft.value = cloneValue(resolveUpdater(previous, updater));
      });
    },
    [
      cleanupOnUnmount,
      initialValue,
      key,
      setVolatileStateValue,
      uiLocalStateCollection,
    ],
  );

  const resetValue = useCallback(() => {
    if (cleanupOnUnmount) {
      resetVolatileStateValue();
      return;
    }

    if (!key) {
      return;
    }

    if (!uiLocalStateCollection.has(key)) {
      uiLocalStateCollection.insert({
        id: key,
        value: cloneValue(initialValue),
      });
      return;
    }

    uiLocalStateCollection.update(key, (draft) => {
      draft.value = cloneValue(initialValue);
    });
  }, [
    cleanupOnUnmount,
    initialValue,
    key,
    resetVolatileStateValue,
    uiLocalStateCollection,
  ]);

  return [
    cleanupOnUnmount
      ? volatileValue
      : ((stateRow?.value as T | undefined) ?? cloneValue(initialValue)),
    setValue,
    resetValue,
  ] as const;
}
