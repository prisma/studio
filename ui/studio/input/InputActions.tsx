import { CornerDownLeft } from "lucide-react";
import type { PropsWithChildren } from "react";

export interface InputActionsProps extends PropsWithChildren {
  disabled?: boolean;
  onCancel?: () => void;
  onSave?: () => void;
  saveText?: string;
  showSave?: boolean;
}

export function InputActions(props: InputActionsProps) {
  const { children, disabled, onCancel, onSave, saveText, showSave = true } =
    props;

  return (
    <div className="flex flex-row gap-1 border-t border-table-border text-xs p-2">
      <div className="flex flex-col gap-1 w-full">
        <div className="grid grid-cols-2 gap-1 items-start justify-between">
          <div className="flex flex-col gap-1">
            {showSave && (
              <button
                aria-disabled={disabled}
                className="flex flex-row gap-1 items-center cursor-pointer shrink-0"
                disabled={disabled}
                onClick={() => onSave?.()}
              >
                <kbd className="inline-flex justify-center items-center h-6 w-6 rounded-md bg-muted text-muted-foreground">
                  <CornerDownLeft size={12} strokeWidth={2} />
                </kbd>{" "}
                {saveText || "Save changes"}
              </button>
            )}
            <button
              className="flex flex-row gap-1 items-center cursor-pointer shrink-0"
              onClick={() => onCancel?.()}
            >
              <kbd className="inline-flex justify-center items-center h-6 w-6 rounded-md bg-muted text-muted-foreground text-[8px] leading-none font-semibold">
                Esc
              </kbd>{" "}
              Cancel changes
            </button>
          </div>
          <div className="flex flex-col gap-1 items-end">{children}</div>
        </div>
      </div>
    </div>
  );
}
