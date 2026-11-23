import { useCallback, useMemo } from "react";

import type {
  TemporalWorkflowExecution,
  TemporalWorkflowSortField,
} from "@/data/temporal";
import { useUiState } from "@/ui/hooks/use-ui-state";

import { formatDuration } from "./temporal-utils";
import { TemporalTime, WorkflowStatusBadge } from "./TemporalPrimitives";

export interface WorkflowColumn {
  align?: "right";
  cellClassName?: string;
  defaultWidth: number;
  id: string;
  label: string;
  render: (
    run: TemporalWorkflowExecution,
    actions: { onOpen: () => void },
  ) => React.ReactNode;
  sortField?: TemporalWorkflowSortField;
}

export const WORKFLOW_GRID_COLUMNS_UI_STATE_KEY = "temporal:grid-columns";

interface GridColumnsState {
  /** The ids of the shown columns, in order. Null means the default set. */
  shown: string[] | null;
  widths: Record<string, number>;
}

const DEFAULT_STATE: GridColumnsState = { shown: null, widths: {} };
const MIN_COLUMN_WIDTH = 64;

const BUILT_IN_COLUMNS: WorkflowColumn[] = [
  {
    defaultWidth: 172,
    id: "status",
    label: "Status",
    render: (run) => <WorkflowStatusBadge status={run.status} />,
    sortField: "ExecutionStatus",
  },
  {
    cellClassName: "font-medium text-foreground",
    defaultWidth: 190,
    id: "type",
    label: "Type",
    render: (run) => run.workflowType,
    sortField: "WorkflowType",
  },
  {
    defaultWidth: 260,
    id: "workflowId",
    label: "Workflow ID",
    render: (run, { onOpen }) => (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        className="block max-w-full truncate rounded-sm py-1 text-left font-mono text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={run.workflowId}
      >
        {run.workflowId}
      </button>
    ),
    sortField: "WorkflowId",
  },
  {
    cellClassName: "font-mono text-muted-foreground",
    defaultWidth: 130,
    id: "taskQueue",
    label: "Task Queue",
    render: (run) => run.taskQueue,
    sortField: "TaskQueue",
  },
  {
    cellClassName: "text-muted-foreground",
    defaultWidth: 170,
    id: "started",
    label: "Started",
    render: (run) => <TemporalTime iso={run.startTime} />,
    sortField: "StartTime",
  },
  {
    cellClassName: "text-muted-foreground",
    defaultWidth: 170,
    id: "ended",
    label: "Ended",
    render: (run) => <TemporalTime iso={run.closeTime} />,
    sortField: "CloseTime",
  },
  {
    align: "right",
    cellClassName: "font-mono tabular-nums text-foreground",
    defaultWidth: 110,
    id: "duration",
    label: "Duration",
    render: (run) => formatDuration(run.durationMs),
    sortField: "Duration",
  },
  {
    align: "right",
    cellClassName: "font-mono tabular-nums text-muted-foreground",
    defaultWidth: 90,
    id: "events",
    label: "Events",
    // The server counts the events of a run only when the run closes.
    render: (run) =>
      run.historyLength > 0 ? run.historyLength.toLocaleString("en-US") : "—",
    sortField: "HistoryLength",
  },
  {
    cellClassName: "font-mono text-muted-foreground",
    defaultWidth: 290,
    id: "runId",
    label: "Run ID",
    render: (run) => run.runId,
  },
];

const DEFAULT_COLUMN_IDS = [
  "status",
  "type",
  "workflowId",
  "taskQueue",
  "started",
  "duration",
  "events",
];

function formatAttribute(value: unknown): string {
  return value === undefined || value === null
    ? "—"
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
}

/** A column for one memo field (`memo:customer`) or one Search Attribute (`attr:Region`). */
function attributeColumn(id: string): WorkflowColumn {
  const [source, ...rest] = id.split(":");
  const key = rest.join(":");

  return {
    cellClassName: "font-mono text-muted-foreground",
    defaultWidth: 160,
    id,
    label: source === "memo" ? `Memo: ${key}` : key,
    render: (run) =>
      formatAttribute(
        (source === "memo" ? run.memo : run.searchAttributes)[key],
      ),
  };
}

/**
 * The columns of the Workflows grid: which are shown, in which order and how
 * wide. The browser remembers the choice. Besides the built-in columns, every
 * memo field and Search Attribute found on the listed rows can be a column.
 */
export function useWorkflowColumns(executions: TemporalWorkflowExecution[]) {
  const [state, setState] = useUiState<GridColumnsState>(
    WORKFLOW_GRID_COLUMNS_UI_STATE_KEY,
    DEFAULT_STATE,
    { persistent: true },
  );
  const shownIds = state.shown ?? DEFAULT_COLUMN_IDS;
  const available = useMemo(() => {
    const ids = new Set<string>();

    for (const run of executions) {
      for (const key of Object.keys(run.memo)) ids.add(`memo:${key}`);
      for (const key of Object.keys(run.searchAttributes))
        ids.add(`attr:${key}`);
    }

    // A shown column stays in the list on a page whose rows lack the field.
    for (const id of shownIds) {
      if (id.includes(":")) ids.add(id);
    }

    return [...BUILT_IN_COLUMNS, ...[...ids].sort().map(attributeColumn)];
  }, [executions, shownIds]);
  const columns = useMemo(
    () =>
      shownIds
        .map((id) => available.find((column) => column.id === id))
        .filter((column): column is WorkflowColumn => column !== undefined),
    [available, shownIds],
  );
  const toggleColumn = useCallback(
    (id: string) => {
      setState((previous) => {
        const shown = previous.shown ?? DEFAULT_COLUMN_IDS;

        return {
          ...previous,
          shown: shown.includes(id)
            ? shown.filter((item) => item !== id)
            : [...shown, id],
        };
      });
    },
    [setState],
  );
  const setColumnWidth = useCallback(
    (id: string, width: number) => {
      setState((previous) => ({
        ...previous,
        widths: {
          ...previous.widths,
          [id]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)),
        },
      }));
    },
    [setState],
  );
  const resetColumns = useCallback(() => setState(DEFAULT_STATE), [setState]);

  return {
    available,
    columns,
    resetColumns,
    setColumnWidth,
    shownIds,
    toggleColumn,
    widthOf: (column: WorkflowColumn) =>
      state.widths[column.id] ?? column.defaultWidth,
  };
}
