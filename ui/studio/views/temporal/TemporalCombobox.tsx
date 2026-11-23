import { Check, ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/ui/components/ui/popover";
import { cn } from "@/ui/lib/utils";

export interface TemporalComboboxOption {
  /** A fact shown beside the value, such as a count of runs. */
  detail?: string;
  value: string;
}

/** The options that start with the typed text, then those that hold it. */
export function filterComboboxOptions(
  options: TemporalComboboxOption[],
  typed: string,
): TemporalComboboxOption[] {
  const needle = typed.trim().toLowerCase();
  const startsWith = options.filter((option) =>
    option.value.toLowerCase().startsWith(needle),
  );

  return [
    ...startsWith,
    ...options.filter(
      (option) =>
        !startsWith.includes(option) &&
        option.value.toLowerCase().includes(needle),
    ),
  ];
}

/**
 * A text field that offers known values in a list under it. The user may also
 * type a value that is not in the list: a Workflow Type or Task Queue can
 * exist on a Worker before any run used it.
 *
 * The focus stays in the field. The arrow keys choose an item, Enter or Tab
 * takes it, and the button at the end opens the whole list.
 */
export function TemporalCombobox(props: {
  id: string;
  /** What the options are, for the button that opens the list: "Workflow Types". */
  listLabel: string;
  onChange: (value: string) => void;
  options: TemporalComboboxOption[];
  placeholder?: string;
  value: string;
}) {
  const { id, listLabel, onChange, options, placeholder, value } = props;
  const listId = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  // The list shows every option until the user types: the value in the field
  // is then the current choice, not a search.
  const [hasTyped, setHasTyped] = useState(false);
  const [chosenIndex, setChosenIndex] = useState(-1);
  const items = hasTyped ? filterComboboxOptions(options, value) : options;
  const isShown = isOpen && items.length > 0;
  // What Enter and Tab take: the chosen item, or the first match of typed text.
  const takenIndex = chosenIndex >= 0 ? chosenIndex : hasTyped ? 0 : -1;

  const open = () => {
    setIsOpen(true);
    setHasTyped(false);
    setChosenIndex(options.findIndex((option) => option.value === value));
  };
  const close = () => {
    setIsOpen(false);
    setChosenIndex(-1);
  };
  const take = (option: TemporalComboboxOption) => {
    onChange(option.value);
    close();
  };

  return (
    <Popover
      open={isShown}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      <PopoverAnchor asChild>
        <div ref={anchor} className="relative flex items-center">
          <Input
            ref={input}
            id={id}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={isShown ? listId : undefined}
            aria-expanded={isShown}
            aria-activedescendant={
              isShown && takenIndex >= 0 ? `${listId}-${takenIndex}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={placeholder}
            className="h-8 pr-8 font-mono text-xs"
            onChange={(event) => {
              onChange(event.target.value);
              setIsOpen(true);
              setHasTyped(true);
              setChosenIndex(-1);
            }}
            onClick={() => {
              if (!isOpen) {
                open();
              }
            }}
            onBlur={(event) => {
              // A click in the list keeps the focus here, so a blur means the user left.
              if (!anchor.current?.contains(event.relatedTarget)) {
                close();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();

                if (!isShown) {
                  open();
                  return;
                }

                setChosenIndex((index) =>
                  event.key === "ArrowDown"
                    ? (index + 1) % items.length
                    : (index <= 0 ? items.length : index) - 1,
                );
              } else if (
                isShown &&
                takenIndex >= 0 &&
                (event.key === "Enter" ||
                  (event.key === "Tab" && !event.shiftKey))
              ) {
                // Tab goes on to the next field with the item taken.
                if (event.key === "Enter") {
                  event.preventDefault();
                }

                take(items[takenIndex]!);
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            // The field itself opens the list with the arrow keys.
            tabIndex={-1}
            aria-label={`Show all ${listLabel}`}
            className="absolute right-1 w-6 px-0 text-muted-foreground"
            disabled={options.length === 0}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (isOpen) {
                close();
              } else {
                open();
                input.current?.focus();
              }
            }}
          >
            <ChevronDown />
          </Button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="max-h-64 w-(--radix-popover-trigger-width) min-w-56 overflow-y-auto p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          // A click in the field or on its button is handled there.
          if (anchor.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
      >
        <div id={listId} role="listbox" aria-label={listLabel}>
          {items.map((option, index) => (
            // The keys are handled on the field, which keeps the focus: see `onKeyDown` there.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === takenIndex}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent/60",
                index === takenIndex && "bg-accent",
              )}
              // Keeps the focus in the field.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => take(option)}
            >
              <Check
                aria-hidden
                className={cn(
                  "size-3 shrink-0",
                  option.value === value ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                {option.value}
              </span>
              {option.detail ? (
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {option.detail}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
