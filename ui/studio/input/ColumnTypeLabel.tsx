import { Info } from "lucide-react";
import type { PropsWithChildren } from "react";

import type { Column } from "../../../data/adapter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { formatDatatypeName } from "../../lib/datatype-display";

export interface ColumnTypeLabelProps {
  column: Column;
}

/**
 * Surfaces the DB column type Studio believes a cell has, directly inside the
 * cell editor popover.
 *
 * Why: introspection is cached, so when the live schema drifts (e.g. a column
 * changed from boolean to varchar after Studio loaded) the editor can render
 * the wrong widget. Showing the cached type makes that drift visible to the
 * user instead of producing a silently wrong input. The refresh-schema action
 * and the write-error self-heal path keep this label accurate.
 *
 * Composition: standard ShadCN `Tooltip` triggered by a small muted text
 * label, so it stays unobtrusive but discoverable. The readable type string
 * comes from {@link formatDatatypeName}, which maps internal catalog names to
 * common SQL aliases.
 */
export function ColumnTypeLabel(
  props: PropsWithChildren<ColumnTypeLabelProps>,
) {
  const { children, column } = props;
  const typeName = formatDatatypeName(column.datatype);
  const isArray = column.datatype.isArray;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Column type: ${typeName}`}
                className="inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Info size={11} className="text-muted-foreground/70" />
                <span className="font-mono lowercase">
                  type: {typeName}
                  {isArray ? " (array)" : ""}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              <p className="font-sans">
                Database column type Studio uses for this editor.
              </p>
              <p className="mt-1 font-sans text-muted-foreground">
                If this no longer matches the live schema, use “Refresh schema”.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {column.nullable ? (
          <span className="font-mono lowercase text-muted-foreground/70">
            nullable
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
