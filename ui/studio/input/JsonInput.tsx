import { useMemo } from "react";

import type { Column } from "../../../data/adapter";
import { DEFAULT_ARRAY_DISPLAY, DEFAULT_JSON } from "../../../data/defaults";
import { usePopoverActions } from "../../components/ui/popover-cell";
import type { CellEditNavigationDirection } from "./get-input";
import { InputActions } from "./InputActions";
import { useInput } from "./use-input";

export interface JsonInputProps {
  column: Column;
  context: "edit" | "insert";
  onNavigate?: (direction: CellEditNavigationDirection) => void;
  onSubmit: (value: unknown) => void;
  value: unknown;
  readonly: boolean;
  showSaveAction?: boolean;
}

export function JsonInput(props: JsonInputProps) {
  const {
    column,
    context,
    onNavigate,
    onSubmit,
    readonly,
    showSaveAction,
    value,
  } = props;
  const { datatype, defaultValue, fkColumn, isRequired, nullable } = column;
  const { isArray } = datatype;

  const valueAsString = useMemo(
    () =>
      value == null
        ? context === "insert" && isRequired && !fkColumn
          ? isArray
            ? DEFAULT_ARRAY_DISPLAY
            : DEFAULT_JSON
          : ""
        : JSON.stringify(value, null, 2),
    [context, fkColumn, isArray, isRequired, value],
  );
  const emptyValue =
    context === "insert" && defaultValue != null
      ? undefined
      : nullable
        ? null
        : isArray
          ? DEFAULT_ARRAY_DISPLAY
          : DEFAULT_JSON;

  const { handleOnChange, value: currentValue } = useInput({
    initialValue: valueAsString,
  });

  const { handleSave, handleCancel, handleKeyDown } = usePopoverActions({
    onNavigate,
    onSave: () => {
      const currentValueForComparison =
        !currentValue && isRequired && !fkColumn
          ? isArray
            ? DEFAULT_ARRAY_DISPLAY
            : DEFAULT_JSON
          : currentValue;

      if (currentValueForComparison !== valueAsString) {
        onSubmit(
          !currentValue
            ? emptyValue
              ? isArray
                ? []
                : {}
              : emptyValue
            : (JSON.parse(currentValue) as object),
        );

        return true;
      }

      return false;
    },
  });

  return (
    <div onKeyDown={handleKeyDown}>
      <div className="flex flex-row items-center gap-4 py-0">
        <textarea
          aria-disabled={readonly}
          aria-required={isRequired}
          className="cell-input-base appearance-none w-full border-none outline-none shadow-none bg-transparent focus-visible:ring-0 resize px-(--studio-cell-spacing)"
          disabled={readonly}
          lang="en_EN"
          onChange={handleOnChange}
          required={isRequired}
          rows={5}
          value={currentValue}
        />
      </div>
      <InputActions
        disabled={readonly}
        onCancel={handleCancel}
        onSave={handleSave}
        saveText={
          !currentValue
            ? emptyValue === null
              ? "Set null"
              : emptyValue === undefined
                ? "Set default"
                : `Set '${emptyValue}'`
            : undefined
        }
        showSave={showSaveAction}
      />
    </div>
  );
}
