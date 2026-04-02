import { Search, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/ui/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/ui/components/ui/command";
import { Input } from "@/ui/components/ui/input";
import { cn } from "@/ui/lib/utils";

interface ExpandableSearchControlProps {
  alignment?: "left" | "right";
  disabled?: boolean;
  expandedWidthClassName?: string;
  onBlockedInteraction?: () => void;
  placeholder?: string;
  rowSearch: {
    acceptSearchSuggestion: (value: string) => void;
    closeRowSearch: () => void;
    isRowSearchOpen: boolean;
    isSearchInputInvalid: boolean;
    openRowSearch: () => void;
    rowSearchInputRef: React.RefObject<HTMLInputElement | null>;
    searchSuggestions: Array<{
      annotation?: string | null;
      group?: string | null;
      id: string;
      label: string;
      value: string;
    }>;
    searchInput: string;
    searchValidationMessage: string | null;
    setSearchInput: (value: string) => void;
  };
  supportsSearch: boolean;
}

export function ExpandableSearchControl(props: ExpandableSearchControlProps) {
  const {
    alignment = "right",
    disabled = false,
    expandedWidthClassName = "w-56",
    onBlockedInteraction,
    placeholder = "Global search",
    rowSearch,
    supportsSearch,
  } = props;
  const {
    acceptSearchSuggestion,
    closeRowSearch,
    isRowSearchOpen,
    isSearchInputInvalid,
    openRowSearch,
    rowSearchInputRef,
    searchSuggestions,
    searchInput,
    searchValidationMessage,
    setSearchInput,
  } = rowSearch;
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<
    string | null
  >(null);
  const suggestionItemRefs = useRef(new Map<string, HTMLDivElement | null>());
  const pendingPointerSelectionIdRef = useRef<string | null>(null);
  const highlightedSuggestionIndex = useMemo(() => {
    if (!highlightedSuggestionId) {
      return -1;
    }

    return searchSuggestions.findIndex(
      (suggestion) => suggestion.id === highlightedSuggestionId,
    );
  }, [highlightedSuggestionId, searchSuggestions]);
  const searchSuggestionsByGroup = useMemo(() => {
    const suggestionsByGroup = new Map<
      string,
      Array<{
        annotation?: string | null;
        id: string;
        label: string;
        value: string;
      }>
    >();

    for (const suggestion of searchSuggestions) {
      const groupName = suggestion.group ?? "Suggestions";
      const existingSuggestions = suggestionsByGroup.get(groupName);

      if (existingSuggestions) {
        existingSuggestions.push(suggestion);
        continue;
      }

      suggestionsByGroup.set(groupName, [suggestion]);
    }

    return [...suggestionsByGroup.entries()];
  }, [searchSuggestions]);
  const hasSearchAssistPanel =
    isSearchInputInvalid || searchSuggestions.length > 0;

  useEffect(() => {
    if (!disabled) {
      return;
    }

    closeRowSearch();
  }, [closeRowSearch, disabled]);

  useEffect(() => {
    setHighlightedSuggestionId((currentId) => {
      if (searchSuggestions.length === 0) {
        return null;
      }

      if (
        currentId &&
        searchSuggestions.some((suggestion) => suggestion.id === currentId)
      ) {
        return currentId;
      }

      return searchSuggestions[0]?.id ?? null;
    });
  }, [searchSuggestions]);

  useEffect(() => {
    if (!highlightedSuggestionId) {
      return;
    }

    suggestionItemRefs.current.get(highlightedSuggestionId)?.scrollIntoView({
      block: "nearest",
    });
  }, [highlightedSuggestionId]);

  function handleBlockedInteraction() {
    onBlockedInteraction?.();
  }

  function handleBlockedMouseDown(event: ReactMouseEvent<HTMLElement>) {
    if (!disabled) {
      return;
    }

    event.preventDefault();
    handleBlockedInteraction();
  }

  function handleSearchSuggestionSelection(suggestionValue: string) {
    if (disabled) {
      handleBlockedInteraction();
      return;
    }

    acceptSearchSuggestion(suggestionValue);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      handleBlockedInteraction();
      event.preventDefault();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeRowSearch();
      return;
    }

    if (searchSuggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex =
        highlightedSuggestionIndex < 0
          ? 0
          : (highlightedSuggestionIndex + 1) % searchSuggestions.length;
      const nextSuggestion = searchSuggestions[nextIndex];

      if (nextSuggestion) {
        setHighlightedSuggestionId(nextSuggestion.id);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex =
        highlightedSuggestionIndex <= 0
          ? searchSuggestions.length - 1
          : highlightedSuggestionIndex - 1;
      const nextSuggestion = searchSuggestions[nextIndex];

      if (nextSuggestion) {
        setHighlightedSuggestionId(nextSuggestion.id);
      }
      return;
    }

    if (event.key === "Enter" && highlightedSuggestionId) {
      const activeSuggestion = searchSuggestions.find(
        (suggestion) => suggestion.id === highlightedSuggestionId,
      );

      if (!activeSuggestion) {
        return;
      }

      event.preventDefault();
      handleSearchSuggestionSelection(activeSuggestion.value);
    }
  }

  if (!supportsSearch) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative h-9 transition-[width] duration-200 ease-out",
        isRowSearchOpen ? expandedWidthClassName : "w-9",
      )}
      data-row-search-open={isRowSearchOpen ? "true" : "false"}
    >
      <Button
        aria-disabled={disabled || undefined}
        aria-label="Global search"
        className={cn(
          "absolute top-0 min-w-9 w-auto px-2 transition-opacity duration-200",
          alignment === "left" ? "left-0" : "right-0",
          disabled && "opacity-70",
          isRowSearchOpen && "pointer-events-none opacity-0",
        )}
        onClick={() => {
          if (disabled) {
            handleBlockedInteraction();
            return;
          }

          openRowSearch();
        }}
        onMouseDown={handleBlockedMouseDown}
        size="icon"
        type="button"
        variant="outline"
      >
        <Search />
      </Button>
      <div
        className={cn(
          "absolute top-1/2 z-40 w-full -translate-y-1/2 transition-[opacity,transform] duration-200 ease-out will-change-transform",
          alignment === "left" ? "left-0 origin-left" : "right-0 origin-right",
          isRowSearchOpen
            ? "scale-x-100 opacity-100"
            : "pointer-events-none scale-x-0 opacity-0",
        )}
        data-row-search-input-wrapper
      >
        <div className="relative">
          <Input
            aria-disabled={disabled || undefined}
            aria-invalid={isSearchInputInvalid || undefined}
            aria-label="Global search"
            className={cn(
              "h-9 w-full bg-background pr-10 shadow-none",
              disabled && "opacity-70",
            )}
            data-search-syntax-message={searchValidationMessage ?? undefined}
            data-search-syntax-state={
              isSearchInputInvalid ? "invalid" : "valid"
            }
            onBlur={(event) => {
              if (disabled) {
                return;
              }

              if (event.currentTarget.value.trim().length > 0) {
                return;
              }

              closeRowSearch();
            }}
            onChange={(event) => {
              if (disabled) {
                handleBlockedInteraction();
                return;
              }

              setSearchInput(event.currentTarget.value);
            }}
            onClick={() => {
              if (disabled) {
                handleBlockedInteraction();
              }
            }}
            onFocus={(event) => {
              if (!disabled) {
                return;
              }

              handleBlockedInteraction();
              event.currentTarget.blur();
            }}
            onKeyDown={(event) => {
              handleInputKeyDown(event);
            }}
            onMouseDown={handleBlockedMouseDown}
            placeholder={placeholder}
            readOnly={disabled}
            ref={rowSearchInputRef}
            value={searchInput}
          />
          <Button
            aria-disabled={disabled || undefined}
            aria-label="Close search"
            className="absolute right-1 top-1/2 size-7 -translate-y-1/2 rounded-sm shadow-none"
            data-testid="search-close-button"
            onClick={() => {
              if (disabled) {
                handleBlockedInteraction();
                return;
              }

              closeRowSearch();
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              handleBlockedMouseDown(event);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
        {hasSearchAssistPanel ? (
          <div
            className="absolute left-0 top-full z-50 mt-1 w-max min-w-[300px] max-w-full rounded-md border bg-background shadow-md"
            data-testid="search-assist-panel"
          >
            {isSearchInputInvalid && searchValidationMessage ? (
              <div
                className={cn(
                  "px-3 py-2",
                  searchSuggestions.length > 0 && "border-b border-border",
                )}
                data-testid="search-validation-message"
                role="status"
              >
                <div className="text-sm font-medium text-foreground">
                  Invalid search query
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {searchValidationMessage}
                </p>
              </div>
            ) : null}
            {searchSuggestions.length > 0 ? (
              <Command
                className="rounded-md border-0 bg-transparent"
                onValueChange={(value) => {
                  setHighlightedSuggestionId(value || null);
                }}
                shouldFilter={false}
                value={highlightedSuggestionId ?? ""}
              >
                <CommandList className="max-h-64 px-1 py-1">
                  {searchSuggestionsByGroup.map(([groupName, suggestions]) => (
                    <CommandGroup heading={groupName} key={groupName}>
                      {suggestions.map((suggestion) => {
                        return (
                          <CommandItem
                            data-testid="search-suggestion-item"
                            key={suggestion.id}
                            onMouseEnter={() => {
                              setHighlightedSuggestionId(suggestion.id);
                            }}
                            onMouseDown={(event) => {
                              event.preventDefault();

                              if (event.button !== 0) {
                                return;
                              }

                              pendingPointerSelectionIdRef.current =
                                suggestion.id;
                              handleSearchSuggestionSelection(suggestion.value);
                            }}
                            onSelect={() => {
                              if (
                                pendingPointerSelectionIdRef.current ===
                                suggestion.id
                              ) {
                                pendingPointerSelectionIdRef.current = null;
                                return;
                              }

                              handleSearchSuggestionSelection(suggestion.value);
                            }}
                            ref={(element) => {
                              if (element) {
                                suggestionItemRefs.current.set(
                                  suggestion.id,
                                  element,
                                );
                                return;
                              }

                              suggestionItemRefs.current.delete(suggestion.id);
                            }}
                            value={suggestion.id}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-foreground">
                                {suggestion.label}
                              </div>
                              {suggestion.annotation ? (
                                <div className="truncate text-[11px] font-normal text-muted-foreground">
                                  {suggestion.annotation}
                                </div>
                              ) : null}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
