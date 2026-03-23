import { Column } from "@/data";
import { useStableUiStateKey, useUiState } from "@/ui/hooks/use-ui-state";
import { cn } from "@/ui/lib/utils";

import { badgeVariants } from "../../components/ui/badge";
import { usePopoverActions } from "../../components/ui/popover-cell";
import type { CellEditNavigationDirection } from "./get-input";
import { InputActions } from "./InputActions";

export interface EnumInputProps {
  column: Column;
  context: "edit" | "insert";
  onNavigate?: (direction: CellEditNavigationDirection) => void;
  onSubmit: (value: string | null | undefined) => void;
  options: string[];
  readonly: boolean;
  showSaveAction?: boolean;
  value: unknown;
}

export function EnumInput(props: EnumInputProps) {
  const {
    column,
    context,
    onNavigate,
    onSubmit,
    options,
    readonly,
    showSaveAction,
    value,
  } = props;
  const { defaultValue, nullable } = column;

  const inputStateKey = useStableUiStateKey("enum-input");
  const [currentValue, setCurrentValue] = useUiState<string | null | undefined>(
    inputStateKey,
    value == null ? value : String(value),
    { cleanupOnUnmount: true },
  );

  const { handleSave, handleCancel, handleKeyDown } = usePopoverActions({
    onNavigate,
    onSave: () => {
      if (currentValue !== value) {
        onSubmit(currentValue);

        return true;
      }

      return false;
    },
  });

  const getClassName = (option: string | null | undefined) =>
    cn(
      badgeVariants({
        variant: option === currentValue ? "default" : "outline",
      }),
      "focus:ring-accent-foreground focus:ring-offset-background focus:ring-offset-1",
    );

  return (
    <div onKeyDown={handleKeyDown}>
      <div className="flex items-center gap-2 h-(--studio-cell-height) px-2 py-0 w-full text-sm text-muted-foreground">
        {currentValue === null ? (
          <span className="italic">(NULL)</span>
        ) : currentValue === undefined ? (
          <span className="italic">(default value)</span>
        ) : (
          currentValue
        )}
      </div>
      <div className="flex flex-row flex-wrap gap-2 p-2 min-w-(--radix-popover-trigger-width) max-w-[300px] w-full border-t border-table-border overflow-y-scroll max-h-32">
        {nullable ? (
          <button
            className={getClassName(null)}
            disabled={readonly}
            key="__PS_NULL__"
            onClick={() => setCurrentValue(null)}
          >
            <span className="italic">(NULL)</span>
          </button>
        ) : null}
        {context === "insert" && defaultValue != null ? (
          <button
            className={getClassName(undefined)}
            disabled={readonly}
            key="__PS_DEFAULT_VALUE__"
            onClick={() => setCurrentValue(undefined)}
          >
            <span className="italic">(default value)</span>
          </button>
        ) : null}
        {options.map((option) => (
          <button
            className={getClassName(option)}
            disabled={readonly}
            key={option}
            onClick={() => setCurrentValue(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <InputActions
        disabled={readonly}
        onCancel={handleCancel}
        onSave={handleSave}
        showSave={showSaveAction}
      />
    </div>
  );
}
