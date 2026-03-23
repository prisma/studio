import { ArrowUp10, Asterisk, Calculator, KeyRound } from "lucide-react";
import type { ReactNode } from "react";

import { Column } from "../../../data/adapter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";

function HeaderTooltipIcon(props: { children: ReactNode; tooltip: ReactNode }) {
  const { children, tooltip } = props;

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0 items-center justify-center">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function DataGridHeaderCell({ column }: { column: Column }) {
  const {
    datatype,
    fkColumn,
    fkSchema,
    fkTable,
    isAutoincrement,
    isComputed,
    isRequired,
    name,
    pkPosition,
  } = column;

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {pkPosition != null && (
        <HeaderTooltipIcon tooltip={<span>Primary key</span>}>
          <KeyRound size={12} className="text-amber-500" />
        </HeaderTooltipIcon>
      )}
      {fkColumn != null && (
        <HeaderTooltipIcon
          tooltip={
            <span>
              Foreign key - references{" "}
              {[fkSchema, fkTable, fkColumn].filter(Boolean).join(".")}
            </span>
          }
        >
          <KeyRound size={12} className="text-primary" />
        </HeaderTooltipIcon>
      )}
      {isAutoincrement && (
        <HeaderTooltipIcon tooltip={<span>Auto-increment</span>}>
          <ArrowUp10 size={12} className="text-muted-foreground" />
        </HeaderTooltipIcon>
      )}
      {isComputed && (
        <HeaderTooltipIcon tooltip={<span>Computed</span>}>
          <Calculator size={12} className="text-muted-foreground" />
        </HeaderTooltipIcon>
      )}
      {isRequired && (
        <HeaderTooltipIcon
          tooltip={
            <span>
              Required - not nullable, computed, auto-incrementing, and has no
              default value
            </span>
          }
        >
          <Asterisk size={12} className="text-destructive" />
        </HeaderTooltipIcon>
      )}
      <span className="min-w-0 truncate font-medium">{name}</span>
      <span className="min-w-0 truncate lowercase text-muted-foreground/70">
        {datatype.affinity || datatype.name}
      </span>
    </div>
  );
}
