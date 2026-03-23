import { Table } from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useEffect, useId, useState } from "react";

import { Button, buttonVariants } from "@/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import { Switch } from "@/ui/components/ui/switch";
import { cn } from "@/ui/lib/utils";

export interface DataGridPaginationProps {
  className?: string;
  controlsDisabled?: boolean;
  infiniteScrollEnabled?: boolean;
  onBlockedInteraction?: () => void;
  onInfiniteScrollEnabledChange?: (enabled: boolean) => void;
  table: Table<Record<string, unknown>>;
  variant?: "basic" | "numeric";
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 500] as const;

export function DataGridPagination(props: DataGridPaginationProps) {
  const {
    controlsDisabled = false,
    infiniteScrollEnabled = false,
    onBlockedInteraction,
    onInfiniteScrollEnabledChange,
    table,
    variant = "basic",
  } = props;

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const [pageDraft, setPageDraft] = useState(String(pageIndex + 1));
  const [isPageSizeMenuOpen, setIsPageSizeMenuOpen] = useState(false);
  const infiniteScrollControlId = useId();
  const pageDigitCount = Math.max(
    String(Math.max(pageCount, 1)).length,
    pageDraft.trim().length || 1,
  );
  const shouldBlockInteraction = controlsDisabled;
  const shouldDisablePageControls =
    infiniteScrollEnabled && !shouldBlockInteraction;

  useEffect(() => {
    setPageDraft(String(pageIndex + 1));
  }, [pageIndex]);

  function handleBlockedInteraction() {
    onBlockedInteraction?.();
  }

  function handleBlockedMouseDown(event: ReactMouseEvent<HTMLElement>) {
    if (!shouldBlockInteraction) {
      return;
    }

    event.preventDefault();
    handleBlockedInteraction();
  }

  function handleBlockedInputFocus(
    event: ReactFocusEvent<HTMLInputElement>,
  ): void {
    if (!shouldBlockInteraction) {
      return;
    }

    handleBlockedInteraction();
    event.currentTarget.blur();
  }

  function handleDraftKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
    commitDraft: (draftValue: string) => void,
  ): void {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    commitDraft(event.currentTarget.value);
  }

  function commitPageDraft(draftValue = pageDraft): void {
    if (shouldBlockInteraction || shouldDisablePageControls) {
      return;
    }

    const nextPage = parsePositiveInteger(draftValue);

    if (nextPage == null) {
      setPageDraft(String(pageIndex + 1));
      return;
    }

    const pageCountLimit = Math.max(pageCount, 1);
    const clampedPage = Math.min(Math.max(nextPage, 1), pageCountLimit);

    table.setPageIndex(clampedPage - 1);
    setPageDraft(String(clampedPage));
  }

  return (
    <div className="rounded-b-lg overflow-visible sticky bottom-0 left-0 border-t-0 w-full z-20 p-0">
      <div className="flex items-center justify-between gap-2 py-3 px-2 border-t border-table-border backdrop-blur-sm bg-background/90">
        {variant === "basic" ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-disabled={
                shouldBlockInteraction ||
                !table.getCanPreviousPage() ||
                undefined
              }
              className={controlsDisabled ? "opacity-70" : undefined}
              onMouseDown={handleBlockedMouseDown}
              onClick={() => {
                if (shouldBlockInteraction) {
                  handleBlockedInteraction();
                  return;
                }

                if (shouldDisablePageControls) {
                  return;
                }

                if (!table.getCanPreviousPage()) {
                  return;
                }

                table.previousPage();
              }}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-disabled={
                shouldBlockInteraction || !table.getCanNextPage() || undefined
              }
              className={controlsDisabled ? "opacity-70" : undefined}
              onMouseDown={handleBlockedMouseDown}
              onClick={() => {
                if (shouldBlockInteraction) {
                  handleBlockedInteraction();
                  return;
                }

                if (shouldDisablePageControls) {
                  return;
                }

                if (!table.getCanNextPage()) {
                  return;
                }

                table.nextPage();
              }}
            >
              Next
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div
              aria-label="Pagination"
              className="inline-flex items-stretch overflow-hidden rounded-md border border-input bg-background shadow-sm"
              role="group"
            >
              <Button
                aria-label="Go to first page"
                variant="outline"
                size="icon"
                disabled={
                  shouldDisablePageControls || !table.getCanPreviousPage()
                }
                aria-disabled={
                  shouldBlockInteraction ||
                  !table.getCanPreviousPage() ||
                  undefined
                }
                className={cn(
                  "h-9 w-9 rounded-none border-0 border-r border-input shadow-none",
                  controlsDisabled ? "opacity-70" : undefined,
                )}
                onMouseDown={handleBlockedMouseDown}
                onClick={() => {
                  if (shouldBlockInteraction) {
                    handleBlockedInteraction();
                    return;
                  }

                  if (shouldDisablePageControls) {
                    return;
                  }

                  if (!table.getCanPreviousPage()) {
                    return;
                  }

                  table.setPageIndex(0);
                }}
              >
                <ChevronsLeft data-icon="inline-start" />
              </Button>
              <Button
                aria-label="Go to previous page"
                variant="outline"
                size="icon"
                disabled={
                  shouldDisablePageControls || !table.getCanPreviousPage()
                }
                aria-disabled={
                  shouldBlockInteraction ||
                  !table.getCanPreviousPage() ||
                  undefined
                }
                className={cn(
                  "h-9 w-9 rounded-none border-0 border-r border-input shadow-none",
                  controlsDisabled ? "opacity-70" : undefined,
                )}
                onMouseDown={handleBlockedMouseDown}
                onClick={() => {
                  if (shouldBlockInteraction) {
                    handleBlockedInteraction();
                    return;
                  }

                  if (shouldDisablePageControls) {
                    return;
                  }

                  if (!table.getCanPreviousPage()) {
                    return;
                  }

                  table.previousPage();
                }}
              >
                <ChevronLeft data-icon="inline-start" />
              </Button>
              <div className="flex items-center gap-2 border-r border-input px-3 font-sans text-xs font-medium text-foreground tabular-nums">
                <Input
                  aria-disabled={shouldBlockInteraction || undefined}
                  aria-label="Page number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  type="text"
                  value={pageDraft}
                  className={cn(
                    "h-9 w-auto min-w-0 rounded-none border-0 px-1 text-right font-sans text-xs text-foreground tabular-nums shadow-none focus-visible:ring-0",
                    (shouldBlockInteraction || shouldDisablePageControls) &&
                      "opacity-70",
                  )}
                  style={{ width: `${pageDigitCount + 1}ch` }}
                  readOnly={shouldBlockInteraction || shouldDisablePageControls}
                  onMouseDown={handleBlockedMouseDown}
                  onClick={() => {
                    if (shouldBlockInteraction) {
                      handleBlockedInteraction();
                    }
                  }}
                  onBlur={(event) => commitPageDraft(event.currentTarget.value)}
                  onChange={(event) => setPageDraft(event.target.value)}
                  onInput={(event) =>
                    setPageDraft((event.target as HTMLInputElement).value)
                  }
                  onFocus={handleBlockedInputFocus}
                  onKeyDown={(event) =>
                    handleDraftKeyDown(event, commitPageDraft)
                  }
                />
                <span className="shrink-0">of</span>
                <span className="shrink-0">{pageCount}</span>
              </div>
              <DropdownMenu
                open={isPageSizeMenuOpen && !shouldDisablePageControls}
                onOpenChange={(nextOpen) => {
                  if (shouldBlockInteraction) {
                    if (nextOpen) {
                      handleBlockedInteraction();
                    }

                    setIsPageSizeMenuOpen(false);
                    return;
                  }

                  if (shouldDisablePageControls) {
                    setIsPageSizeMenuOpen(false);
                    return;
                  }

                  setIsPageSizeMenuOpen(nextOpen);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-disabled={shouldBlockInteraction || undefined}
                    aria-label="Rows per page"
                    variant="outline"
                    size="sm"
                    disabled={shouldDisablePageControls}
                    className={cn(
                      "h-9 rounded-none border-0 border-r border-input px-3 shadow-none font-sans text-xs font-medium",
                      "justify-between gap-2 whitespace-nowrap",
                      controlsDisabled ? "opacity-70" : undefined,
                    )}
                    onMouseDown={handleBlockedMouseDown}
                    onClick={(event) => {
                      if (!shouldBlockInteraction) {
                        return;
                      }

                      event.preventDefault();
                      handleBlockedInteraction();
                    }}
                  >
                    <span>{pageSize} rows per page</span>
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="min-w-[11rem] font-sans"
                >
                  <DropdownMenuRadioGroup
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      const nextPageSize = parsePositiveInteger(value);

                      if (nextPageSize == null) {
                        return;
                      }

                      table.setPageSize(nextPageSize);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem
                        key={option}
                        value={String(option)}
                        className="font-sans text-xs"
                      >
                        {option} rows per page
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                aria-label="Go to next page"
                variant="outline"
                size="icon"
                disabled={shouldDisablePageControls || !table.getCanNextPage()}
                aria-disabled={
                  shouldBlockInteraction || !table.getCanNextPage() || undefined
                }
                className={cn(
                  "h-9 w-9 rounded-none border-0 border-r border-input shadow-none",
                  controlsDisabled ? "opacity-70" : undefined,
                )}
                onMouseDown={handleBlockedMouseDown}
                onClick={() => {
                  if (shouldBlockInteraction) {
                    handleBlockedInteraction();
                    return;
                  }

                  if (shouldDisablePageControls) {
                    return;
                  }

                  if (!table.getCanNextPage()) {
                    return;
                  }

                  table.nextPage();
                }}
              >
                <ChevronRight data-icon="inline-start" />
              </Button>
              <Button
                aria-label="Go to last page"
                variant="outline"
                size="icon"
                disabled={shouldDisablePageControls || !table.getCanNextPage()}
                aria-disabled={
                  shouldBlockInteraction || !table.getCanNextPage() || undefined
                }
                className={cn(
                  "h-9 w-9 rounded-none border-0 shadow-none",
                  controlsDisabled ? "opacity-70" : undefined,
                )}
                onMouseDown={handleBlockedMouseDown}
                onClick={() => {
                  if (shouldBlockInteraction) {
                    handleBlockedInteraction();
                    return;
                  }

                  if (shouldDisablePageControls) {
                    return;
                  }

                  if (!table.getCanNextPage()) {
                    return;
                  }

                  table.setPageIndex(pageCount - 1);
                }}
              >
                <ChevronsRight data-icon="inline-start" />
              </Button>
            </div>
            <div
              className={cn(
                buttonVariants({ size: "default", variant: "outline" }),
                "h-9 gap-3 px-3 font-sans text-xs shadow-sm",
                shouldBlockInteraction && "opacity-70",
              )}
            >
              <Switch
                id={infiniteScrollControlId}
                aria-label="Infinite scroll"
                checked={infiniteScrollEnabled}
                onMouseDown={handleBlockedMouseDown}
                onCheckedChange={(checked) => {
                  if (shouldBlockInteraction) {
                    handleBlockedInteraction();
                    return;
                  }

                  onInfiniteScrollEnabledChange?.(checked === true);
                }}
              />
              <Label
                className="cursor-pointer font-sans text-xs font-medium"
                htmlFor={infiniteScrollControlId}
                onMouseDown={handleBlockedMouseDown}
              >
                infinite scroll
              </Label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function parsePositiveInteger(value: string): number | null {
  const trimmedValue = value.trim();

  if (!/^\d+$/.test(trimmedValue)) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  if (
    !Number.isInteger(parsedValue) ||
    !Number.isSafeInteger(parsedValue) ||
    parsedValue <= 0
  ) {
    return null;
  }

  return parsedValue;
}
