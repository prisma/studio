import { useCallback, useMemo } from "react";

import { useNavigation } from "./use-navigation";

export function parsePinnedColumns(
  pinParam: string | null | undefined,
): string[] {
  if (!pinParam) {
    return [];
  }

  const seen = new Set<string>();
  const pinnedColumnIds: string[] = [];

  for (const columnId of pinParam.split(",")) {
    const normalizedColumnId = columnId.trim();
    if (normalizedColumnId.length === 0 || seen.has(normalizedColumnId)) {
      continue;
    }

    seen.add(normalizedColumnId);
    pinnedColumnIds.push(normalizedColumnId);
  }

  return pinnedColumnIds;
}

export function serializePinnedColumns(columnIds: string[]): string | null {
  const normalized = parsePinnedColumns(columnIds.join(","));
  return normalized.length > 0 ? normalized.join(",") : null;
}

export function useColumnPinning() {
  const { pinParam, setPinParam } = useNavigation();
  const pinnedColumnIds = useMemo(
    () => parsePinnedColumns(pinParam),
    [pinParam],
  );

  const setPinnedColumnIds = useCallback(
    (nextPinnedColumnIds: string[]) => {
      const serializedPinnedColumns = serializePinnedColumns(nextPinnedColumnIds);
      if ((pinParam ?? null) === serializedPinnedColumns) {
        return;
      }

      void setPinParam(serializedPinnedColumns);
    },
    [pinParam, setPinParam],
  );

  return {
    pinnedColumnIds,
    setPinnedColumnIds,
  };
}

