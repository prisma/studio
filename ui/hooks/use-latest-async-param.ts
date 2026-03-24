import { useCallback, useRef, useState } from "react";

type PendingValue<T> =
  | {
      active: false;
    }
  | {
      active: true;
      value: T;
    };

const NO_PENDING_VALUE = {
  active: false,
} as const;

export function useLatestAsyncParam<T>(args: {
  value: T;
  write: (value: T) => Promise<URLSearchParams>;
}): {
  value: T;
  writeLatestValue: (value: T) => Promise<URLSearchParams>;
} {
  const { value, write } = args;
  const [pendingValue, setPendingValue] =
    useState<PendingValue<T>>(NO_PENDING_VALUE);
  const writeStateRef = useRef<{
    hasQueuedWrite: boolean;
    latestValue: T;
    pendingPromise: Promise<URLSearchParams> | null;
  }>({
    hasQueuedWrite: false,
    latestValue: value,
    pendingPromise: null,
  });

  const writeLatestValue = useCallback(
    (nextValue: T) => {
      writeStateRef.current.latestValue = nextValue;
      writeStateRef.current.hasQueuedWrite = true;
      setPendingValue({
        active: true,
        value: nextValue,
      });

      if (writeStateRef.current.pendingPromise == null) {
        writeStateRef.current.pendingPromise = (async () => {
          try {
            let params = new URLSearchParams();

            while (writeStateRef.current.hasQueuedWrite) {
              const valueToWrite = writeStateRef.current.latestValue;
              writeStateRef.current.hasQueuedWrite = false;
              params = await write(valueToWrite);
            }

            return params;
          } finally {
            writeStateRef.current.hasQueuedWrite = false;
            writeStateRef.current.pendingPromise = null;
            setPendingValue(NO_PENDING_VALUE);
          }
        })();
      }

      return writeStateRef.current.pendingPromise;
    },
    [write],
  );

  return {
    value: pendingValue.active ? pendingValue.value : value,
    writeLatestValue,
  };
}
