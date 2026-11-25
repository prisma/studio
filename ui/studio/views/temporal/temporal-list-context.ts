import { useSyncExternalStore } from "react";

/**
 * The list a workflow was opened from: its name, its URL, and its rows as they
 * were when the row was opened. It lives in memory only, so a shared link or a
 * reload shows the workflow without it. A row that changes state afterwards
 * stays in its place, so "next" means the row the user saw next.
 */
export interface TemporalListContext {
  /** The list's URL hash, which brings the list back with its filter. */
  href: string;
  items: Array<{ runId?: string; workflowId: string }>;
  label: string;
}

let current: TemporalListContext | null = null;
const listeners = new Set<() => void>();

export function setTemporalListContext(context: TemporalListContext | null) {
  current = context;
  listeners.forEach((listener) => listener());
}

export function useTemporalListContext(): TemporalListContext | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}

/** Where a workflow is in the list: its run when the list has it, otherwise its Workflow ID. */
export function temporalListPosition(
  context: TemporalListContext,
  workflowId: string,
  runId: string | undefined,
): number {
  const exact = context.items.findIndex(
    (item) => item.workflowId === workflowId && item.runId === runId,
  );

  return exact >= 0
    ? exact
    : context.items.findIndex((item) => item.workflowId === workflowId);
}
