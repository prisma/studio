import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { useMemo } from "react";

import type { Column } from "../../../data/adapter";
import { getDate0 } from "../../../data/defaults";
import { Input } from "../../components/ui/input";
import { usePopoverActions } from "../../components/ui/popover-cell";
import type { CellEditNavigationDirection } from "./get-input";
import { InputActions } from "./InputActions";
import { useInput } from "./use-input";

dayjs.extend(localizedFormat);

export interface TimeInputProps {
  column: Column;
  context: "edit" | "insert";
  onNavigate?: (direction: CellEditNavigationDirection) => void;
  onSubmit: (value: string | null | undefined) => void;
  readonly: boolean;
  showSaveAction?: boolean;
  value: unknown;
}

export function TimeInput(props: TimeInputProps) {
  const {
    column,
    context,
    onNavigate,
    onSubmit,
    readonly,
    showSaveAction,
    value,
  } = props;
  const { datatype, fkColumn, isRequired } = column;
  const { format } = datatype;

  if (!format) {
    throw new Error("TimeInput requires a format in the datatype.");
  }

  const valueAsString =
    value == null
      ? isRequired && !fkColumn
        ? getDate0(format)
        : ""
      : String(value);

  const emptyValue =
    context === "insert" && column.defaultValue != null
      ? undefined
      : isRequired && !fkColumn
        ? getDate0(format)
        : null;

  const { handleOnChange, value: inputValue } = useInput({
    initialValue: valueAsString,
  });

  // TODO: simplify this function OR remove the feature entirely.
  const formattedTime = useMemo(() => {
    try {
      if (!inputValue.includes(":")) return inputValue;

      const hasTimezone = /[+-]\d{2}(:\d{2})?$/.test(inputValue);
      const date = dayjs(`2000-01-01 ${inputValue}`);
      if (date.isValid()) {
        return (
          date.format("h:mm A") + (hasTimezone ? ` (${date.format("Z")})` : "")
        );
      }

      const timeRegex =
        /(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?([+-]\d{2}(?::\d{2})?)?/;
      const match = inputValue.match(timeRegex);
      if (match) {
        const hours = parseInt(match[1] || "12", 10);
        const minutes = match[2] || "00";
        const tzOffset = match[4] || "";
        const period = hours >= 12 ? "PM" : "AM";
        const hour12 = hours % 12 === 0 ? 12 : hours % 12;

        return `${hour12}:${minutes} ${period}${tzOffset ? ` (${tzOffset})` : ""}`;
      }

      return inputValue;
    } catch {
      return inputValue;
    }
  }, [inputValue]);

  const { handleCancel, handleKeyDown, handleSave } = usePopoverActions({
    onNavigate,
    onSave: () => {
      const formattedInputValue =
        !inputValue && isRequired && !fkColumn
          ? getDate0(format)
          : formatTime(inputValue, format);
      const formattedValue = formatTime(valueAsString, format);

      if (formattedInputValue !== formattedValue) {
        onSubmit(!inputValue ? emptyValue : inputValue);

        return true;
      }

      return false;
    },
  });

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={handleKeyDown}>
      {/* TODO: add a timepicker to help - similarly to how DateInput has input AND calendar. */}
      <Input
        aria-required={isRequired}
        className="cell-input-leading border-none shadow-none focus-visible:ring-0 resize-none px-(--studio-cell-spacing)"
        onChange={handleOnChange}
        placeholder={format}
        required={isRequired}
        type="text"
        value={inputValue}
      />
      {inputValue && inputValue !== formattedTime ? (
        <div className="flex flex-col gap-1 p-2 border-t border-table-border">
          <div className="text-xs text-muted-foreground">Formatted value</div>
          <div className="text-xs font-mono text-foreground">
            {formattedTime}
          </div>
        </div>
      ) : null}
      <InputActions
        disabled={readonly}
        onCancel={handleCancel}
        onSave={handleSave}
        saveText={
          !inputValue
            ? `Set to ${emptyValue === null ? "NULL" : emptyValue === undefined ? "default value" : emptyValue}`
            : undefined
        }
        showSave={showSaveAction}
      />
    </div>
  );
}

function formatTime(value: string, format: string): string {
  return dayjs(`${new Date(0).toDateString()} ${value}`).format(format);
}
