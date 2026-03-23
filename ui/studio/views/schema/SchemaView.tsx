import { Key } from "lucide-react";

import { useSchemaVisualization } from "../../../hooks/use-schema-visualization";
import { StudioHeader } from "../../StudioHeader";
import { ViewProps } from "../View";
import { SchemaVisualization } from "./Visualiser";

export function SchemaView(_props: ViewProps) {
  const { tables, relationships } = useSchemaVisualization();

  return (
    <>
      <StudioHeader>
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
