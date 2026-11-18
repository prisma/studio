import { RotateCcw } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/ui/components/ui/button";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useUiState } from "@/ui/hooks/use-ui-state";

import { useSchemaVisualization } from "../../../hooks/use-schema-visualization";
import { ColumnBadge } from "../../ColumnBadge";
import { StudioHeader } from "../../StudioHeader";
import { ViewProps } from "../View";
import {
  createSchemaVisualizerPersistentStateScope,
  createSchemaVisualizerStateScope,
  createSchemaVisualizerUiStateKey,
  doSchemaNodePositionsDiffer,
  type SchemaNodePositions,
} from "./schema-layout";
import { SchemaVisualization } from "./Visualiser";

export function SchemaView(_props: ViewProps) {
  const { tables, relationships } = useSchemaVisualization();
  const {
    metadata: { activeSchema },
  } = useNavigation();
  const stateScope = useMemo(
    () => createSchemaVisualizerStateScope(activeSchema?.name, tables),
    [activeSchema?.name, tables],
  );
  const nodeIds = useMemo(
    () =>
      tables
        .map((table) => table.name)
        .sort((left, right) => left.localeCompare(right)),
    [tables],
  );
  const persistentStateScope = useMemo(
    () => createSchemaVisualizerPersistentStateScope(activeSchema?.name),
    [activeSchema?.name],
  );
  const [nodePositions, setNodePositions] = useUiState<SchemaNodePositions>(
    createSchemaVisualizerUiStateKey(stateScope, "node-positions"),
    {},
  );
  const [, setManualNodePositions] = useUiState<SchemaNodePositions>(
    createSchemaVisualizerUiStateKey(persistentStateScope, "node-positions"),
    {},
    { persistent: true },
  );
  const [autoLayoutPositions] = useUiState<SchemaNodePositions>(
    createSchemaVisualizerUiStateKey(stateScope, "auto-layout-node-positions"),
    {},
  );
  const [, setResetLayoutVersion] = useUiState<number>(
    createSchemaVisualizerUiStateKey(stateScope, "reset-layout-version"),
    0,
  );
  const isResetLayoutVisible =
    Object.keys(autoLayoutPositions).length > 0 &&
    doSchemaNodePositionsDiffer(nodeIds, nodePositions, autoLayoutPositions);

  const resetLayoutButton = isResetLayoutVisible ? (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        setNodePositions(autoLayoutPositions);
        setManualNodePositions({});
        setResetLayoutVersion((currentVersion) => currentVersion + 1);
      }}
    >
      <RotateCcw data-icon="inline-start" />
      Reset layout
    </Button>
  ) : null;

  return (
    <>
      <StudioHeader endContent={resetLayoutButton} title="Visualizer">
        {/* Same order as the badge slots on a card row: key, then nullable. */}
        <ul
          aria-label="Legend"
          className="flex min-w-0 items-center gap-4 border-l border-border pl-4 text-xs text-muted-foreground"
        >
          <li className="flex items-center gap-1.5">
            <ColumnBadge kind="primary-key" />
            Primary key
          </li>
          <li className="flex items-center gap-1.5">
            <ColumnBadge kind="foreign-key" />
            Foreign key
          </li>
          <li className="flex items-center gap-1.5">
            <ColumnBadge kind="nullable" />
            Nullable
          </li>
        </ul>
      </StudioHeader>
      <div className="w-full h-full">
        <SchemaVisualization tables={tables} relationships={relationships} />
      </div>
    </>
  );
}
