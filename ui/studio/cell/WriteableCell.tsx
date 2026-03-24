import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useState,
} from "react";

import {
  PopoverCell,
  PopoverCellContent,
  PopoverCellTrigger,
} from "../../components/ui/popover-cell";
import { isGridInteractionSuppressionActive } from "../../lib/grid-interaction-suppression";
import { cn } from "../../lib/utils";
import { Cell, CellProps } from "./Cell";

export interface WriteableCellProps {
  cellComponent: ReactNode;
  inputComponent: ReactNode;
  linkComponent: ReactNode;
  containerProps?: Omit<CellProps, "children" | "ref">;
  isEditorOpen?: boolean;
  onRequestClose?: () => void;
  onRequestOpen?: () => void;
}

export function WriteableCell(props: WriteableCellProps) {
  const {
    cellComponent,
    containerProps,
    inputComponent,
    isEditorOpen,
    linkComponent,
    onRequestClose,
    onRequestOpen,
  } = props;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = isEditorOpen !== undefined;
  const open = isControlled ? isEditorOpen : uncontrolledOpen;

  function openEditor() {
    if (!isControlled) {
      setUncontrolledOpen(true);
    }

    onRequestOpen?.();
  }

  function closeEditor() {
    if (!isControlled) {
      setUncontrolledOpen(false);
    }

    onRequestClose?.();
  }

  const content = (
    <div className="flex w-full min-w-0 items-center justify-between gap-2">
      <div className="min-w-0 flex-1 truncate">{cellComponent}</div>
      {linkComponent}
    </div>
  );

  if (!open) {
    return (
      <Cell
        {...containerProps}
        onClick={composeOpenHandler(containerProps?.onClick, openEditor)}
        onDoubleClick={composeOpenHandler(
          containerProps?.onDoubleClick,
          openEditor,
        )}
        withContextMenu={false}
      >
        {content}
      </Cell>
    );
  }

  return (
    <PopoverCell
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && closeEditor()}
    >
      <PopoverCellTrigger asChild>
        <Cell {...containerProps} withContextMenu={false}>
          {content}
        </Cell>
      </PopoverCellTrigger>
      <PopoverCellContent
        align="start"
        alignOffset={-1}
        className={cn(
          "p-0 z-30 gap-0 border-muted-foreground/50",
          "w-[calc(var(--radix-popover-trigger-width)+1px)] max-w-72 min-w-max",
        )}
        sideOffset={-40}
      >
        <div className="bg-secondary/70">{inputComponent}</div>
      </PopoverCellContent>
    </PopoverCell>
  );
}

function composeOpenHandler(
  forwardedHandler: ((event: ReactMouseEvent<unknown>) => void) | undefined,
  openEditor: () => void,
) {
  return (event: ReactMouseEvent<unknown>) => {
    forwardedHandler?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (shouldSuppressCellOpen(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    openEditor();
  };
}

function shouldSuppressCellOpen(event: ReactMouseEvent<unknown>) {
  if (event.button !== 0) {
    return true;
  }

  return isGridInteractionSuppressionActive();
}
