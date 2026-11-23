import { Search, X } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { TemporalFacets } from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/ui/components/ui/popover";
import { cn } from "@/ui/lib/utils";

import {
  type ListFilterSuggestion,
  suggestListFilter,
} from "./temporal-filter-suggestions";

/**
 * The search field of the Workflows grid. While the user types a List Filter
 * it offers attribute names, then values, then AND or OR. Tab takes the
 * offered item; Enter always runs the search as typed unless the arrow keys
 * chose an item, so plain text and pasted IDs work as before.
 */
export function TemporalSearchField(props: {
  draft: string;
  facets: TemporalFacets | undefined;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClear: () => void;
  onDraftChange: (text: string) => void;
  onSubmit: (text: string) => void;
}) {
  const { draft, facets, inputRef, onClear, onDraftChange, onSubmit } = props;
  const listId = useId();
  const formRef = useRef<HTMLFormElement | null>(null);
  const pendingCursor = useRef<number | null>(null);
  const [cursor, setCursor] = useState(draft.length);
  const [isFocused, setIsFocused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [chosenIndex, setChosenIndex] = useState(-1);
  const suggestions = useMemo(
    () =>
      isFocused && !isDismissed
        ? suggestListFilter({ cursor, facets, nowMs: Date.now(), text: draft })
        : null,
    [cursor, draft, facets, isDismissed, isFocused],
  );
  const items = suggestions?.items ?? [];
  const isOpen = items.length > 0;
  // Tab takes the item the arrow keys chose, or the first one.
  const tabIndex = Math.min(Math.max(chosenIndex, 0), items.length - 1);

  // A controlled input moves its cursor to the end when its text is replaced.
  useLayoutEffect(() => {
    if (pendingCursor.current !== null) {
      inputRef.current?.setSelectionRange(
        pendingCursor.current,
        pendingCursor.current,
      );
      pendingCursor.current = null;
    }
  }, [draft, inputRef]);

  const accept = (item: ListFilterSuggestion) => {
    pendingCursor.current = item.cursor;
    onDraftChange(item.text);
    setCursor(item.cursor);
    setChosenIndex(-1);
    setIsDismissed(false);
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setIsDismissed(true);
        }
      }}
    >
      <PopoverAnchor asChild>
        <form
          ref={formRef}
          className="relative flex min-w-36 max-w-xl flex-1 items-center"
          onSubmit={(event) => {
            event.preventDefault();
            setIsDismissed(true);
            onSubmit(draft.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={isOpen ? listId : undefined}
            aria-expanded={isOpen}
            aria-activedescendant={
              isOpen && chosenIndex >= 0
                ? `${listId}-${chosenIndex}`
                : undefined
            }
            aria-label="Visibility query"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(event) => {
              onDraftChange(event.target.value);
              setCursor(
                event.target.selectionStart ?? event.target.value.length,
              );
              setChosenIndex(-1);
              setIsDismissed(false);
            }}
            onSelect={(event) => {
              // While an accepted item is on its way into the field, the field still reports the old cursor.
              if (pendingCursor.current === null) {
                setCursor(
                  event.currentTarget.selectionStart ??
                    event.currentTarget.value.length,
                );
              }
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              setChosenIndex(-1);
            }}
            onKeyDown={(event) => {
              if (!isOpen) {
                return;
              }

              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setChosenIndex((index) =>
                  event.key === "ArrowDown"
                    ? (index + 1) % items.length
                    : (index <= 0 ? items.length : index) - 1,
                );
              } else if (
                (event.key === "Tab" && !event.shiftKey) ||
                (event.key === "Enter" && chosenIndex >= 0)
              ) {
                event.preventDefault();
                accept(items[tabIndex]!);
              }
            }}
            placeholder='Search IDs and types, or filter: TaskQueue = "billing"'
            className="h-8 pr-8 pl-8 font-mono text-xs"
            data-testid="temporal-visibility-search"
          />
          {draft.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label="Clear visibility query"
              onClick={onClear}
              className="absolute right-1 w-6 px-0 text-muted-foreground"
            >
              <X />
            </Button>
          ) : null}
        </form>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          // A click in the field itself moves the cursor; it does not close the list.
          if (formRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
        data-testid="temporal-search-suggestions"
      >
        <div className="px-2 py-1 font-mono text-2xs uppercase tracking-loose text-muted-foreground">
          {suggestions?.heading}
        </div>
        <div id={listId} role="listbox" aria-label={suggestions?.heading}>
          {items.map((item, index) => (
            // The keys are handled on the field, which keeps the focus: see `onKeyDown` there.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={item.label}
              id={`${listId}-${index}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === chosenIndex}
              className={cn(
                // Hover does not choose the item: a pointer resting where the list opens must not change what Enter does.
                "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 font-mono text-xs hover:bg-accent/60",
                index === chosenIndex && "bg-accent",
              )}
              // Keeps the focus in the field, so typing goes on after the click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => accept(item)}
            >
              <span className="min-w-0 truncate text-foreground">
                {item.label}
              </span>
              {item.detail ? (
                <span className="min-w-0 truncate text-muted-foreground">
                  {item.detail}
                </span>
              ) : null}
              {index === tabIndex ? (
                <kbd className="ml-auto shrink-0 rounded border border-border px-1 font-sans text-2xs text-muted-foreground">
                  Tab
                </kbd>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-1 border-t border-border px-2 pt-1.5 pb-1 text-2xs text-muted-foreground">
          Tab takes the item. Arrow keys choose another. Enter searches.
        </div>
      </PopoverContent>
    </Popover>
  );
}
