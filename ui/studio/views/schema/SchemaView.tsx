import { Key, RotateCcw } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/ui/components/ui/button";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useUiState } from "@/ui/hooks/use-ui-state";

import { useSchemaVisualization } from "../../../hooks/use-schema-visualization";
import { StudioHeader } from "../../StudioHeader";
import { ViewProps } from "../View";
import {
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
  const [nodePositions, setNodePositions] = useUiState<SchemaNodePositions>(
    createSchemaVisualizerUiStateKey(stateScope, "node-positions"),
    {},
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
        setResetLayoutVersion((currentVersion) => currentVersion + 1);
      }}
    >
      <RotateCcw data-icon="inline-start" />
      Reset layout
    </Button>
  ) : null;

  return (
    <>
      <StudioHeader endContent={resetLayoutButton}>
        {/* Legend Item: Primary Key */}
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-muted p-0.5 text-muted-foreground">
            <Key className="size-3 text-primary" />
          </span>
          <p className="text-xs text-muted-foreground">Primary Key</p>
        </div>

        {/* Legend Item: Nullable */}
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-muted p-0.5 text-muted-foreground">
            <span className="inline-flex size-3 items-center justify-center text-center leading-none">
              ?
            </span>
          </span>
          <p className="text-xs text-muted-foreground">Nullable</p>
        </div>

        {/* Legend Item: Foreign Key */}
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary p-0.5 text-primary-foreground">
            <Key className="size-3" />
          </span>
          <p className="text-xs text-muted-foreground">Foreign Key</p>
        </div>
      </StudioHeader>
      <div className="w-full h-full">
        <SchemaVisualization tables={tables} relationships={relationships} />
      </div>
    </>
  );
}
