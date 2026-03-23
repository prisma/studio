import type { Column } from "../../../data/adapter";
import { DEFAULT_NUMERIC } from "../../../data/defaults";
import { Label } from "../../components/ui/label";
import { usePopoverActions } from "../../components/ui/popover-cell";
import type { CellEditNavigationDirection } from "./get-input";
import { InputActions } from "./InputActions";
import { useInput } from "./use-input";

export interface NumericInputProps {
  column: Column;
  context: "edit" | "insert";
  onNavigate?: (direction: CellEditNavigationDirection) => void;
  onSubmit: (value: number | null | undefined) => void;
  readonly: boolean;
  showSaveAction?: boolean;
  value: unknown;
}

export function NumericInput(props: NumericInputProps) {
  const {
    column,
    context,
    onNavigate,
    onSubmit,
    readonly,
    showSaveAction,
    value,
  } = props;
  const { defaultValue, fkColumn, isRequired } = column;

  const valueAsString =
    value == null
      ? isRequired && !fkColumn
        ? String(DEFAULT_NUMERIC)
        : ""
      : String(value);
  const emptyValue =
    context === "insert" && defaultValue != null
      ? undefined
      : isRequired && !fkColumn
        ? 0
        : null;

  const { setValue: setCurrentValue, value: currentValue } = useInput({
    initialValue: valueAsString,
  });

  const { handleSave, handleCancel, handleKeyDown } = usePopoverActions({
    onNavigate,
    onSave: () => {
      const currentValueForComparison =
        !currentValue && isRequired && !fkColumn
          ? String(DEFAULT_NUMERIC)
          : currentValue;

      if (currentValueForComparison !== valueAsString) {
        onSubmit(currentValue === "" ? emptyValue : Number(currentValue));

        return true;
      }

      return false;
    },
  });

  return (
    <div onKeyDown={handleKeyDown}>
      <div className="flex flex-row items-center h-(--studio-cell-height) gap-4 py-0">
        <Label htmlFor="numeric-input" className="sr-only">
          Numeric
        </Label>
        {/* TODO: limit to ints when int */}
        {/* TODO: limit to datatype min/max and precision dynamically */}
        <input
          aria-required={isRequired}
          className="cell-input-leading appearance-none w-full border-none outline-none shadow-none bg-transparent focus-visible:ring-0 resize-none px-(--studio-cell-spacing)"
          disabled={readonly}
          inputMode="numeric"
          lang="en_EN"
          onChange={(event) => setCurrentValue(event.target.value)}
          pattern="\d*"
          required={isRequired}
          step="any"
          type="text"
          value={currentValue}
        />
      </div>
      <InputActions
        disabled={readonly}
        onCancel={handleCancel}
        onSave={handleSave}
        saveText={
          currentValue === ""
            ? `Set to ${emptyValue === null ? "NULL" : emptyValue === undefined ? "default value" : emptyValue}`
            : undefined
        }
        showSave={showSaveAction}
      />
    </div>
  );
}
