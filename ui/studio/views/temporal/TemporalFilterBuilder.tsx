import { ListFilter, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { TemporalFacets } from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/components/ui/select";

import {
  LIST_FILTER_STATUSES,
  LIST_FILTER_TIME_PRESETS,
  type ListFilterAttributeKind,
  listFilterAttributes,
} from "./temporal-filter-suggestions";
import {
  buildListFilter,
  type ListFilterCondition,
  type ListFilterOperator,
  parseListFilter,
} from "./temporal-utils";

const STATUSES = LIST_FILTER_STATUSES;
const TIME_PRESETS = LIST_FILTER_TIME_PRESETS;

const OPERATORS: Record<ListFilterAttributeKind, ListFilterOperator[]> = {
  number: ["=", ">", "<", "!="],
  status: ["=", "!="],
  text: ["=", "STARTS_WITH", "!="],
  time: [">", "<"],
};

const OPERATOR_LABEL: Record<ListFilterOperator, string> = {
  "!=": "is not",
  "<": "before / less than",
  "=": "is",
  ">": "after / greater than",
  STARTS_WITH: "starts with",
};

/**
 * Builds a List Filter from rows of attribute, operator and value, for people
 * who do not know the filter syntax. It reads back any filter that is a plain
 * AND of comparisons, and writes the text into the search field.
 */
export function TemporalFilterBuilder(props: {
  facets: TemporalFacets | undefined;
  onApply: (query: string) => void;
  query: string;
}) {
  const { facets, onApply, query } = props;
  const [open, setOpen] = useState(false);
  const [conditions, setConditions] = useState<ListFilterCondition[]>([]);
  const attributes = listFilterAttributes(facets);
  const kindOf = (name: string): ListFilterAttributeKind =>
    attributes.find((attribute) => attribute.name === name)?.kind ?? "text";

  useEffect(() => {
    if (!open) {
      return;
    }

    const parsed = parseListFilter(query);

    setConditions(
      parsed && parsed.length > 0
        ? parsed
        : [{ attribute: "ExecutionStatus", operator: "=", value: "" }],
    );
  }, [open, query]);

  const update = (index: number, change: Partial<ListFilterCondition>) =>
    setConditions((previous) =>
      previous.map((condition, position) =>
        position === index ? { ...condition, ...change } : condition,
      ),
    );
  const filter = buildListFilter(conditions);
  const cannotRead = open && parseListFilter(query) === null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          data-testid="temporal-filter-builder"
        >
          <ListFilter />
          <span className="max-xl:sr-only">Filter</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        aria-label="Filter builder"
        className="flex w-[36rem] max-w-[calc(100vw-2rem)] flex-col gap-3"
      >
        {cannotRead ? (
          <p className="text-2xs text-muted-foreground">
            The current search uses syntax this builder does not read, such as
            OR. Applying replaces it.
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          {conditions.map((condition, index) => {
            const kind = kindOf(condition.attribute);
            const suggestions =
              condition.attribute === "WorkflowType"
                ? (facets?.workflowTypes ?? []).map((type) => type.name)
                : condition.attribute === "TaskQueue"
                  ? (facets?.taskQueues ?? []).map((queue) => queue.name)
                  : [];
            const listId = `temporal-filter-values-${index}`;

            return (
              <div
                key={index}
                className="grid grid-cols-[11rem_9rem_minmax(0,1fr)_1.5rem] items-center gap-2"
              >
                <Select
                  value={condition.attribute}
                  onValueChange={(attribute) => {
                    const nextKind = kindOf(attribute);

                    update(index, {
                      attribute,
                      operator: OPERATORS[nextKind][0]!,
                      value: "",
                    });
                  }}
                >
                  <SelectTrigger
                    aria-label="Attribute"
                    className="h-8 font-mono text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {attributes.map((attribute) => (
                      <SelectItem
                        key={attribute.name}
                        className="font-mono text-xs"
                        value={attribute.name}
                      >
                        {attribute.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={condition.operator}
                  onValueChange={(operator) =>
                    update(index, { operator: operator as ListFilterOperator })
                  }
                >
                  <SelectTrigger aria-label="Operator" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS[kind].map((operator) => (
                      <SelectItem
                        key={operator}
                        className="text-xs"
                        value={operator}
                      >
                        {OPERATOR_LABEL[operator]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {kind === "status" ? (
                  <Select
                    value={condition.value}
                    onValueChange={(value) => update(index, { value })}
                  >
                    <SelectTrigger aria-label="Value" className="h-8 text-xs">
                      <SelectValue placeholder="Choose a status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem
                          key={status}
                          className="text-xs"
                          value={status}
                        >
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : kind === "time" ? (
                  <div className="flex min-w-0 items-center gap-1">
                    <Input
                      aria-label="Value"
                      value={condition.value}
                      onChange={(e) => update(index, { value: e.target.value })}
                      placeholder="2026-11-23T08:00:00Z"
                      className="h-8 min-w-0 font-mono text-xs"
                    />
                    <Select
                      value=""
                      onValueChange={(ms) =>
                        update(index, {
                          value: new Date(Date.now() - Number(ms))
                            .toISOString()
                            .replace(/\.\d+Z$/, "Z"),
                        })
                      }
                    >
                      <SelectTrigger
                        aria-label="Quick time choices"
                        className="h-8 w-8 shrink-0 justify-center px-0 text-xs [&>span]:hidden"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_PRESETS.map((preset) => (
                          <SelectItem
                            key={preset.ms}
                            className="text-xs"
                            value={String(preset.ms)}
                          >
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <Input
                      aria-label="Value"
                      list={suggestions.length > 0 ? listId : undefined}
                      value={condition.value}
                      onChange={(e) => update(index, { value: e.target.value })}
                      className="h-8 font-mono text-xs"
                    />
                    {suggestions.length > 0 ? (
                      <datalist id={listId}>
                        {suggestions.map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                    ) : null}
                  </>
                )}
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-6 px-0 text-muted-foreground"
                  aria-label="Remove this condition"
                  onClick={() =>
                    setConditions((previous) =>
                      previous.filter((_, position) => position !== index),
                    )
                  }
                >
                  <X />
                </Button>
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="self-start text-muted-foreground"
          onClick={() =>
            setConditions((previous) => [
              ...previous,
              { attribute: "WorkflowType", operator: "=", value: "" },
            ])
          }
        >
          <Plus />
          Add Condition
        </Button>
        <code
          className="block min-h-8 rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono text-2xs text-foreground"
          data-testid="temporal-filter-preview"
        >
          {filter || "No condition has a value yet"}
        </code>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(filter);
              setOpen(false);
            }}
          >
            Apply Filter
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
