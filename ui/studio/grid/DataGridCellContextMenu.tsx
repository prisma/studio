import { Copy } from "lucide-react";
import {
  isValidElement,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useRef,
} from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import { setGridInteractionSuppressionWindow } from "../../lib/grid-interaction-suppression";

export interface DataGridCellContextMenuProps extends PropsWithChildren {
  copyText?: string | (() => string);
}

// TODO: This needs to be inversified - to make it extensible, and adaptable to different situations.
export function DataGridCellContextMenu(props: DataGridCellContextMenuProps) {
  const { children, copyText } = props;
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleCopyAction = useCallback(() => {
    setGridInteractionSuppressionWindow();
    const providedCopyText =
      typeof copyText === "function" ? copyText() : copyText;
    const content =
      providedCopyText ??
      (getVisibleTriggerText(triggerRef.current) ||
        extractTextContent(children));

    if (content == null) {
      return;
    }

    void navigator.clipboard.writeText(content).catch((error) => {
      console.error("Failed to copy to clipboard:", error);
    });
  }, [children, copyText]);

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block w-full h-full">
        <div data-studio-context-menu-trigger ref={triggerRef}>
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onPointerDown={() => setGridInteractionSuppressionWindow()}
          onSelect={() => handleCopyAction()}
          className="flex items-center gap-2"
        >
          <Copy size={12} />
          Copy
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function getVisibleTriggerText(node: HTMLElement | null): string {
  return node?.innerText?.trim() ?? "";
}

function extractTextContent(node: ReactNode): string {
  if (
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "boolean"
  ) {
    return String(node);
  }

  if (node === null || node === undefined) {
    return "";
  }

  if (isValidElement(node)) {
    const props = node.props as { text?: string; children?: React.ReactNode };

    // Handle RevealText component specifically
    if (
      node.type &&
      typeof node.type === "function" &&
      node.type.name === "RevealText"
    ) {
      return props.text || "";
    }

    // Handle NullValue component
    if (
      node.type &&
      typeof node.type === "function" &&
      node.type.name === "NullValue"
    ) {
      return "NULL";
    }

    // Recursively extract text from children
    if (props.children) {
      return extractTextContent(props.children as ReactNode);
    }

    return "";
  }

  if (Array.isArray(node)) {
    return node.map(extractTextContent).join("");
  }

  return "";
}
