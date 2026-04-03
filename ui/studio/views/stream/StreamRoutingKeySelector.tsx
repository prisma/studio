import { Loader2, Waypoints, X } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/ui/components/ui/popover";
import { cn } from "@/ui/lib/utils";

import { useStreamRoutingKeys } from "../../../hooks/use-stream-routing-keys";

const ROUTING_KEY_LIST_HEIGHT_PX = 288;
const ROUTING_KEY_ROW_HEIGHT_PX = 36;
const ROUTING_KEY_OVERSCAN = 6;

function setScrollPosition(element: HTMLDivElement, top: number) {
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top });
    return;
  }

  element.scrollTop = top;
}

export function StreamRoutingKeySelector(props: {
  selectedRoutingKey: string | null;
  setSelectedRoutingKeyParam: (
    value: string | null,
  ) => Promise<URLSearchParams>;
  streamName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [prefixInput, setPrefixInput] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const deferredPrefix = useDeferredValue(prefixInput);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const {
    error,
    hasMoreRoutingKeys,
    isFetching,
    isFetchingNextPage,
    isLoading,
    keys,
    loadMoreRoutingKeys,
  } = useStreamRoutingKeys({
    enabled: isOpen,
    prefix: deferredPrefix,
    streamName: props.streamName,
  });
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / ROUTING_KEY_ROW_HEIGHT_PX) - ROUTING_KEY_OVERSCAN,
    );
    const endIndex = Math.min(
      keys.length,
      Math.ceil(
        (scrollTop + ROUTING_KEY_LIST_HEIGHT_PX) / ROUTING_KEY_ROW_HEIGHT_PX,
      ) + ROUTING_KEY_OVERSCAN,
    );

    return {
      endIndex,
      startIndex,
    };
  }, [keys.length, scrollTop]);
  const visibleKeys = useMemo(
    () =>
      keys
        .slice(visibleRange.startIndex, visibleRange.endIndex)
        .map((routingKey, index) => ({
          index: visibleRange.startIndex + index,
          routingKey,
        })),
    [keys, visibleRange.endIndex, visibleRange.startIndex],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPrefixInput("");
      setScrollTop(0);
      setHighlightedIndex(-1);
      return;
    }

    if (listRef.current) {
      setScrollPosition(listRef.current, 0);
    }
    setScrollTop(0);
  }, [deferredPrefix, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setHighlightedIndex((currentIndex) => {
      if (keys.length === 0) {
        return -1;
      }

      const selectedIndex =
        props.selectedRoutingKey != null
          ? keys.indexOf(props.selectedRoutingKey)
          : -1;

      if (selectedIndex >= 0) {
        return selectedIndex;
      }

      if (currentIndex < 0) {
        return 0;
      }

      return Math.min(currentIndex, keys.length - 1);
    });
  }, [isOpen, keys, props.selectedRoutingKey]);

  useEffect(() => {
    if (
      !isOpen ||
      !hasMoreRoutingKeys ||
      isFetchingNextPage ||
      visibleRange.endIndex < keys.length - ROUTING_KEY_OVERSCAN
    ) {
      return;
    }

    void loadMoreRoutingKeys();
  }, [
    hasMoreRoutingKeys,
    isFetchingNextPage,
    isOpen,
    keys.length,
    loadMoreRoutingKeys,
    visibleRange.endIndex,
  ]);

  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) {
      return;
    }

    const itemTop = highlightedIndex * ROUTING_KEY_ROW_HEIGHT_PX;
    const itemBottom = itemTop + ROUTING_KEY_ROW_HEIGHT_PX;
    const container = listRef.current;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;

    if (itemTop < containerTop) {
      setScrollPosition(container, itemTop);
      return;
    }

    if (itemBottom > containerBottom) {
      setScrollPosition(container, itemBottom - container.clientHeight);
    }
  }, [highlightedIndex]);

  function applyRoutingKey(routingKey: string) {
    setIsOpen(false);
    setPrefixInput("");
    void props.setSelectedRoutingKeyParam(routingKey);
  }

  function clearSelectedRoutingKey() {
    setIsOpen(false);
    setPrefixInput("");
    void props.setSelectedRoutingKeyParam(null);
  }

  function handleClearButtonMouseDown(
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleClearButtonClick(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    clearSelectedRoutingKey();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      return;
    }

    if (keys.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((currentIndex) => {
        const nextIndex =
          currentIndex < 0 ? 0 : Math.min(currentIndex + 1, keys.length - 1);

        if (
          hasMoreRoutingKeys &&
          !isFetchingNextPage &&
          nextIndex >= keys.length - ROUTING_KEY_OVERSCAN
        ) {
          void loadMoreRoutingKeys();
        }

        return nextIndex;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((currentIndex) =>
        currentIndex <= 0 ? 0 : currentIndex - 1,
      );
      return;
    }

    if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      const routingKey = keys[highlightedIndex];

      if (routingKey) {
        applyRoutingKey(routingKey);
      }
    }
  }

  function handleOptionMouseDown(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
      }}
      open={isOpen}
    >
      <div
        className="group/routing-key relative"
        data-testid="stream-routing-key-trigger"
      >
        <PopoverTrigger asChild>
          <Button
            aria-label={
              props.selectedRoutingKey
                ? `Filter by routing key (selected: ${props.selectedRoutingKey})`
                : "Filter by routing key"
            }
            className={cn(
              props.selectedRoutingKey
                ? "h-9 max-w-[20rem] justify-start gap-2 bg-background px-3 pr-10 hover:bg-background"
                : "size-9 bg-background hover:bg-background",
            )}
            data-selected={props.selectedRoutingKey ? "true" : "false"}
            data-testid="stream-routing-key-button"
            size={props.selectedRoutingKey ? "sm" : "icon"}
            title={
              props.selectedRoutingKey
                ? `Routing key: ${props.selectedRoutingKey}`
                : "Filter by routing key"
            }
            type="button"
            variant="outline"
          >
            <Waypoints className="shrink-0" />
            {props.selectedRoutingKey ? (
              <span
                className="truncate font-mono text-xs"
                data-testid="stream-routing-key-button-label"
              >
                {props.selectedRoutingKey}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        {props.selectedRoutingKey ? (
          <Button
            aria-label={`Clear routing key ${props.selectedRoutingKey}`}
            className="group/clear absolute right-1 top-1/2 z-10 size-7 -translate-y-1/2 rounded-sm border-0 bg-transparent p-0 text-muted-foreground opacity-0 pointer-events-none shadow-none transition-all duration-150 ease-out group-hover/routing-key:pointer-events-auto group-hover/routing-key:opacity-100 group-focus-within/routing-key:pointer-events-auto group-focus-within/routing-key:opacity-100 hover:bg-background/80 hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100"
            data-testid="stream-routing-key-clear-button"
            onClick={handleClearButtonClick}
            onMouseDown={handleClearButtonMouseDown}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-3.5 transition-transform duration-150 ease-out group-hover/clear:scale-110 group-focus-visible/clear:scale-110 group-active/clear:scale-110" />
          </Button>
        ) : null}
      </div>
      <PopoverContent
        align="start"
        className="w-[22rem] p-0 font-sans"
        data-testid="stream-routing-key-popover"
      >
        <div className="border-b border-border p-3">
          <Input
            data-testid="stream-routing-key-input"
            onChange={(event) => {
              setPrefixInput(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Filter routing keys by prefix"
            ref={inputRef}
            value={prefixInput}
          />
        </div>
        <div
          className="overflow-auto"
          data-testid="stream-routing-key-list"
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop);
          }}
          ref={listRef}
          style={{ height: ROUTING_KEY_LIST_HEIGHT_PX }}
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading routing keys…
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-sm text-destructive">
              Could not load routing keys.
            </div>
          ) : keys.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No routing keys match this prefix.
            </div>
          ) : (
            <div
              className="relative"
              style={{ height: keys.length * ROUTING_KEY_ROW_HEIGHT_PX }}
            >
              {visibleKeys.map(({ index, routingKey }) => {
                const isHighlighted = index === highlightedIndex;
                const isSelected = routingKey === props.selectedRoutingKey;

                return (
                  <button
                    className={cn(
                      "absolute left-0 right-0 flex h-9 items-center px-3 text-left font-mono text-sm transition-colors",
                      isHighlighted
                        ? "bg-accent text-accent-foreground"
                        : isSelected
                          ? "bg-muted/60 text-foreground"
                          : "hover:bg-muted/60",
                    )}
                    data-highlighted={isHighlighted ? "true" : "false"}
                    data-selected={isSelected ? "true" : "false"}
                    data-testid={`stream-routing-key-option-${index}`}
                    key={`${routingKey}:${index}`}
                    onClick={() => {
                      applyRoutingKey(routingKey);
                    }}
                    onMouseDown={handleOptionMouseDown}
                    onMouseEnter={() => {
                      setHighlightedIndex(index);
                    }}
                    style={{
                      top: index * ROUTING_KEY_ROW_HEIGHT_PX,
                    }}
                    type="button"
                  >
                    {routingKey}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {isFetching && !isLoading ? (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {isFetchingNextPage
              ? "Loading more routing keys…"
              : "Refreshing routing keys…"}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
