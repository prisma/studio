import type { SearchControlSuggestion } from "../../../hooks/use-expandable-search-control";
import type { StudioStreamSearchConfig } from "../../../hooks/use-stream-details";
import type { StudioStreamEvent } from "../../../hooks/use-stream-events";
import { validateStreamSearchQuery } from "./stream-search-query";

const MAX_FIELD_SUGGESTIONS = 100;
const MAX_VALUE_SUGGESTIONS = 100;
const BOOLEAN_OPERATOR_SUGGESTIONS = ["AND", "OR", "NOT"] as const;
const QUERY_OPERATOR_PATTERN = /(?:^|[\s(])(AND|OR|NOT)\s*$/i;
export const STREAM_SEARCH_SUGGESTION_EVENT_MEMORY_LIMIT = 250;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unescapeJsonPointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function readJsonPointerValue(value: unknown, jsonPointer: string): unknown[] {
  if (jsonPointer === "") {
    return [value];
  }

  if (!jsonPointer.startsWith("/")) {
    return [];
  }

  const segments = jsonPointer
    .slice(1)
    .split("/")
    .map((segment) => unescapeJsonPointerSegment(segment));
  let currentValue = value;

  for (const segment of segments) {
    if (Array.isArray(currentValue)) {
      const index = Number(segment);

      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= currentValue.length
      ) {
        return [];
      }

      currentValue = currentValue[index];
      continue;
    }

    if (!isRecord(currentValue) || !(segment in currentValue)) {
      return [];
    }

    currentValue = currentValue[segment];
  }

  if (Array.isArray(currentValue)) {
    return currentValue;
  }

  return [currentValue];
}

function normalizeSuggestionPrimitive(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return null;
}

function quoteSearchString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function formatFieldValueSuggestion(
  value: string,
  fieldKind: StudioStreamSearchConfig["fields"][string]["kind"],
): string {
  if (
    fieldKind === "integer" ||
    fieldKind === "float" ||
    fieldKind === "bool"
  ) {
    return value;
  }

  return quoteSearchString(value);
}

function formatFieldKindLabel(
  fieldKind: StudioStreamSearchConfig["fields"][string]["kind"],
): string {
  switch (fieldKind) {
    case "keyword":
    case "text":
      return "string";
    case "integer":
    case "float":
      return "number";
    case "bool":
      return "boolean";
    case "date":
      return "date";
    default:
      return fieldKind;
  }
}

function createFieldSuggestions(args: {
  input: string;
  searchConfig: StudioStreamSearchConfig;
  token: string;
}): SearchControlSuggestion[] {
  const { input, searchConfig, token } = args;
  const lowerToken = token.toLowerCase();
  const fieldNames = new Set<string>([
    ...Object.keys(searchConfig.fields),
    ...Object.keys(searchConfig.aliases),
  ]);

  return [...fieldNames]
    .filter((fieldName) => fieldName.toLowerCase().startsWith(lowerToken))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_FIELD_SUGGESTIONS)
    .map((fieldName) => {
      const resolvedFieldName = searchConfig.aliases[fieldName] ?? fieldName;
      const field = searchConfig.fields[resolvedFieldName];
      const fieldTypeLabel = field ? formatFieldKindLabel(field.kind) : null;
      const annotationBase =
        searchConfig.aliases[fieldName] != null
          ? `Alias for ${resolvedFieldName}`
          : "Field";

      return {
        annotation: fieldTypeLabel
          ? `${annotationBase} (${fieldTypeLabel})`
          : annotationBase,
        group: "Fields",
        id: `field:${fieldName}`,
        label: `${fieldName}:`,
        value: `${input.slice(0, input.length - token.length)}${fieldName}:`,
      };
    });
}

function createFieldValueSuggestions(args: {
  clausePrefix: string;
  fieldName: string;
  input: string;
  searchConfig: StudioStreamSearchConfig;
  valuePrefix: string;
  events: StudioStreamEvent[];
}): SearchControlSuggestion[] {
  const { clausePrefix, fieldName, input, searchConfig, valuePrefix, events } =
    args;
  const resolvedFieldName = searchConfig.aliases[fieldName] ?? fieldName;
  const field = searchConfig.fields[resolvedFieldName];
  const unitField = searchConfig.fields.unit;

  if (!field) {
    return [];
  }

  const loweredValuePrefix = valuePrefix.toLowerCase();
  const valueCounts = new Map<
    string,
    {
      count: number;
      unitCounts: Map<string, number>;
    }
  >();

  for (const event of events) {
    for (const binding of field.bindings) {
      for (const candidate of readJsonPointerValue(
        event.body,
        binding.jsonPointer,
      )) {
        const normalized = normalizeSuggestionPrimitive(candidate);

        if (!normalized) {
          continue;
        }

        const currentValueEntry = valueCounts.get(normalized) ?? {
          count: 0,
          unitCounts: new Map<string, number>(),
        };

        currentValueEntry.count += 1;

        if (unitField && resolvedFieldName !== "unit") {
          for (const unitBinding of unitField.bindings) {
            for (const unitCandidate of readJsonPointerValue(
              event.body,
              unitBinding.jsonPointer,
            )) {
              const normalizedUnit =
                normalizeSuggestionPrimitive(unitCandidate);

              if (!normalizedUnit) {
                continue;
              }

              currentValueEntry.unitCounts.set(
                normalizedUnit,
                (currentValueEntry.unitCounts.get(normalizedUnit) ?? 0) + 1,
              );
            }
          }
        }

        valueCounts.set(normalized, currentValueEntry);
      }
    }
  }

  return [...valueCounts.entries()]
    .filter(([candidate]) =>
      candidate.toLowerCase().startsWith(loweredValuePrefix),
    )
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count;
      }

      return left[0].localeCompare(right[0]);
    })
    .slice(0, MAX_VALUE_SUGGESTIONS)
    .map(([candidate, metadata]) => {
      const formattedValue = formatFieldValueSuggestion(candidate, field.kind);
      const mostCommonUnit = [...metadata.unitCounts.entries()].sort(
        (left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1];
          }

          return left[0].localeCompare(right[0]);
        },
      )[0]?.[0];

      return {
        annotation: mostCommonUnit
          ? `Loaded event value (unit: ${mostCommonUnit})`
          : "Loaded event value",
        group: "Values",
        id: `value:${fieldName}:${candidate}`,
        label: `${fieldName}:${formattedValue}`,
        value: `${input.slice(0, input.length - clausePrefix.length)}${fieldName}:${formattedValue}`,
      } satisfies SearchControlSuggestion;
    });
}

function createBooleanOperatorSuggestions(
  input: string,
): SearchControlSuggestion[] {
  return BOOLEAN_OPERATOR_SUGGESTIONS.map((operator) => ({
    annotation: "Boolean operator",
    group: "Operators",
    id: `operator:${operator}`,
    label: operator,
    value: `${input}${operator} `,
  }));
}

export function mergeRememberedStreamSearchEvents(args: {
  limit?: number;
  nextEvents: StudioStreamEvent[];
  previousEvents: StudioStreamEvent[];
}): StudioStreamEvent[] {
  const {
    limit = STREAM_SEARCH_SUGGESTION_EVENT_MEMORY_LIMIT,
    nextEvents,
    previousEvents,
  } = args;
  const mergedEvents = new Map<string, StudioStreamEvent>();

  for (const event of nextEvents) {
    mergedEvents.set(event.id, event);
  }

  for (const event of previousEvents) {
    if (!mergedEvents.has(event.id)) {
      mergedEvents.set(event.id, event);
    }
  }

  return [...mergedEvents.values()].slice(0, limit);
}

export function getStreamSearchSuggestions(args: {
  events: StudioStreamEvent[];
  input: string;
  searchConfig: StudioStreamSearchConfig | null | undefined;
}): SearchControlSuggestion[] {
  const { events, input, searchConfig } = args;

  if (!searchConfig) {
    return [];
  }

  if (input.length === 0) {
    return createFieldSuggestions({
      input,
      searchConfig,
      token: "",
    });
  }

  if (/\s$/.test(input)) {
    const trimmedInput = input.trimEnd();

    if (validateStreamSearchQuery(trimmedInput).isValid) {
      return createBooleanOperatorSuggestions(input);
    }

    if (QUERY_OPERATOR_PATTERN.test(trimmedInput)) {
      return createFieldSuggestions({
        input,
        searchConfig,
        token: "",
      });
    }

    return [];
  }

  const fieldValueMatch =
    /([A-Za-z0-9_.-]+):"([^"]*)$/.exec(input) ??
    /([A-Za-z0-9_.-]+):([^\s()"<>:=]*)$/.exec(input) ??
    /([A-Za-z0-9_.-]+):$/.exec(input);

  if (fieldValueMatch) {
    const clausePrefix = fieldValueMatch[0] ?? "";
    const fieldName = fieldValueMatch[1] ?? "";

    if (fieldName.length > 0) {
      return createFieldValueSuggestions({
        clausePrefix,
        events,
        fieldName,
        input,
        searchConfig,
        valuePrefix:
          fieldValueMatch.length >= 3 ? (fieldValueMatch[2] ?? "") : "",
      });
    }
  }

  const fieldPrefixMatch = /([A-Za-z0-9_.-]+)$/.exec(input);

  if (!fieldPrefixMatch) {
    return [];
  }

  const token = fieldPrefixMatch[1] ?? "";
  const tokenStartIndex = input.length - token.length;
  const previousCharacter =
    tokenStartIndex > 0 ? input[tokenStartIndex - 1] : "";

  if (
    previousCharacter &&
    !/\s/.test(previousCharacter) &&
    previousCharacter !== "("
  ) {
    return [];
  }

  if (BOOLEAN_OPERATOR_SUGGESTIONS.includes(token.toUpperCase() as never)) {
    return [];
  }

  return createFieldSuggestions({
    input,
    searchConfig,
    token,
  });
}
