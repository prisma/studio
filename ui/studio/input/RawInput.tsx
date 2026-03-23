import type { Column } from "../../../data/adapter";
import { Input } from "../../components/ui/input";
import { usePopoverActions } from "../../components/ui/popover-cell";
import type { CellEditNavigationDirection } from "./get-input";
import { InputActions } from "./InputActions";
import { useInput } from "./use-input";

export interface RawInputProps {
  column: Column;
  context: "edit" | "insert";
  onNavigate?: (direction: CellEditNavigationDirection) => void;
  onSubmit: (value: string | null | undefined) => void;
  readonly: boolean;
  showSaveAction?: boolean;
  value: unknown;
}

export function RawInput(props: RawInputProps) {
  const {
    column,
    context,
    onNavigate,
    onSubmit,
    readonly,
    showSaveAction,
    value,
  } = props;
  const { defaultValue, isRequired, nullable } = column;

  const valueAsString = value == null ? "" : String(value);
  const emptyValue =
    context === "insert" && defaultValue != null
      ? undefined
      : nullable
        ? null
        : "";

  const { handleOnChange, value: inputValue } = useInput({
    initialValue: valueAsString,
  });

  const { handleSave, handleCancel, handleKeyDown } = usePopoverActions({
    onNavigate,
    onSave: () => {
      if (inputValue !== valueAsString) {
        onSubmit(!inputValue ? emptyValue : inputValue);

        return true;
      }

      return false;
    },
  });

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={handleKeyDown}>
      <Input
        aria-required={isRequired}
        className="cell-input-leading border-none shadow-none focus-visible:ring-0 resize-none px-(--studio-cell-spacing)"
        disabled={readonly}
        onChange={handleOnChange}
        required={isRequired}
        type="text"
        value={inputValue}
      />
      <InputActions
        disabled={readonly}
        onCancel={handleCancel}
        onSave={handleSave}
        saveText={
          !inputValue
            ? `Set to ${emptyValue === null ? "NULL" : emptyValue === undefined ? "default value" : emptyValue === "" ? "empty string" : emptyValue}`
            : undefined
        }
        showSave={showSaveAction}
      />
    </div>
  );
}
