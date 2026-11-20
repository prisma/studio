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
  const {
    children,
    disabled,
    onCancel,
    onSave,
    saveText,
    showSave = true,
  } = props;

  return (
    <div className="flex flex-row gap-1 border-t border-border-weak px-3 py-2 text-xs text-muted-foreground">
      <div className="flex flex-col gap-1 w-full">
        <div className="grid grid-cols-2 gap-1 items-start justify-between">
          <div className="flex flex-col gap-1">
            {showSave && (
              <button
                aria-disabled={disabled}
                className="flex flex-row gap-1.5 items-center cursor-pointer shrink-0 transition-colors hover:text-foreground"
                disabled={disabled}
                onClick={() => onSave?.()}
              >
                <kbd className="inline-flex justify-center items-center h-5 min-w-5 rounded-sm border border-border-weak bg-secondary px-1 text-muted-foreground">
                  <CornerDownLeft size={12} strokeWidth={2} />
                </kbd>{" "}
                {saveText || "Save changes"}
              </button>
            )}
            <button
              className="flex flex-row gap-1.5 items-center cursor-pointer shrink-0 transition-colors hover:text-foreground"
              onClick={() => onCancel?.()}
            >
              <kbd className="inline-flex justify-center items-center h-5 min-w-5 rounded-sm border border-border-weak bg-secondary px-1 font-sans text-[10px] leading-none font-medium text-muted-foreground">
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
