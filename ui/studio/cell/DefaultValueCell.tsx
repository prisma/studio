import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";

export interface DefaultValueCellProps {
  defaultValue: unknown;
}

export function DefaultValueCell(props: DefaultValueCellProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger>
          <span className="italic text-muted-foreground select-none">
            (default value)
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <span>{String(props.defaultValue)}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
