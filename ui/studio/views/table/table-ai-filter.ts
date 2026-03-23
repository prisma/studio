import type { FilterOperator, Table } from "@/data";

import { resolveAiFiltering } from "../../../hooks/ai-filtering";
import type { EditingFilterGroup } from "../../../hooks/filter-utils";

interface ApplyAiTableFilterRequestArgs {
  aiFilter: (input: string) => Promise<string>;
  applyEditingFilter: (filter?: EditingFilterGroup) => void;
  filterOperators?: FilterOperator[];
  request: string;
  setEditingFilter: (filter: EditingFilterGroup) => void;
  table: Table;
}

export async function applyAiTableFilterRequest(
  args: ApplyAiTableFilterRequestArgs,
) {
  const {
    aiFilter,
    applyEditingFilter,
    filterOperators,
    request,
    setEditingFilter,
    table,
  } = args;
  const trimmedRequest = request.trim();

  if (trimmedRequest.length === 0) {
    throw new Error("Please enter a filter request first.");
  }

  const result = await resolveAiFiltering({
    aiFilter,
    filterOperators,
    request: trimmedRequest,
    table,
  });
  const nextFilter = result.filterGroup;

  if (nextFilter.filters.length === 0) {
    throw new Error(
      result.issues[0]?.message ??
        "AI response did not contain any valid filters.",
    );
  }

  setEditingFilter(nextFilter);
  applyEditingFilter(nextFilter);

  return nextFilter;
}
