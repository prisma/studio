import { Fragment, type ReactNode } from "react";

import type {
  StudioStreamSearchConfig,
  StudioStreamSearchFieldKind,
} from "../../../hooks/use-stream-details";

const SEARCH_MATCH_CLASS_NAME =
  "rounded-sm bg-yellow-200/80 text-current dark:bg-yellow-300/60";

type SearchToken =
  | { type: "and" | "colon" | "lparen" | "minus" | "not" | "or" | "rparen" }
  | { type: "string" | "word"; value: string };

type StreamSearchClause =
  | {
      field: string | null;
      kind: "exists";
    }
  | {
      field: string | null;
      kind: "phrase" | "prefix" | "term";
      value: string;
    }
  | {
      field: string;
      kind: "range";
      operator: "<" | "<=" | "=" | ">" | ">=";
      value: string;
    };

type StreamSearchNode =
  | { clause: StreamSearchClause; kind: "clause" }
  | { clauses: StreamSearchNode[]; kind: "and" | "or" }
  | { clause: StreamSearchNode; kind: "not" };

interface StreamValueHighlightRule {
  fieldKind: StudioStreamSearchFieldKind | null;
  kind: StreamSearchClause["kind"];
  operator?: "<" | "<=" | "=" | ">" | ">=";
  path: string;
  value?: string;
}

interface StreamSearchHighlighter {
  fieldPaths: Set<string>;
  valueRules: StreamValueHighlightRule[];
}

interface MatchRange {
  end: number;
  start: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function tokenizeSearchQuery(searchQuery: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  let cursor = 0;

  while (cursor < searchQuery.length) {
    const character = searchQuery[cursor];

    if (!character || /\s/.test(character)) {
      cursor += 1;
      continue;
    }

    if (character === "(") {
      tokens.push({ type: "lparen" });
      cursor += 1;
      continue;
    }

    if (character === ")") {
      tokens.push({ type: "rparen" });
      cursor += 1;
      continue;
    }

    if (character === ":") {
      tokens.push({ type: "colon" });
      cursor += 1;
      continue;
    }

    if (character === "-") {
      tokens.push({ type: "minus" });
      cursor += 1;
      continue;
    }

    if (character === '"') {
      cursor += 1;
      let value = "";

      while (cursor < searchQuery.length) {
        const currentCharacter = searchQuery[cursor];

        if (!currentCharacter) {
          break;
        }

        if (currentCharacter === "\\") {
          value += searchQuery[cursor + 1] ?? "";
          cursor += 2;
          continue;
        }

        if (currentCharacter === '"') {
          cursor += 1;
          break;
        }

        value += currentCharacter;
        cursor += 1;
      }

      tokens.push({
        type: "string",
        value,
      });
      continue;
    }

    let nextCursor = cursor;

    while (nextCursor < searchQuery.length) {
      const nextCharacter = searchQuery[nextCursor];

      if (
        !nextCharacter ||
        /\s/.test(nextCharacter) ||
        nextCharacter === "(" ||
        nextCharacter === ")" ||
        nextCharacter === ":" ||
        nextCharacter === '"'
      ) {
        break;
      }

      nextCursor += 1;
    }

    const value = searchQuery.slice(cursor, nextCursor);
    const upperValue = value.toUpperCase();

    tokens.push(
      upperValue === "AND"
        ? { type: "and" }
        : upperValue === "OR"
          ? { type: "or" }
          : upperValue === "NOT"
            ? { type: "not" }
            : { type: "word", value },
    );
    cursor = nextCursor;
  }

  return tokens;
}

function parseStreamSearchQuery(
  searchQuery: string,
  searchConfig: StudioStreamSearchConfig | null | undefined,
): StreamSearchNode | null {
  const tokens = tokenizeSearchQuery(searchQuery);
  let cursor = 0;

  function peek(offset = 0): SearchToken | undefined {
    return tokens[cursor + offset];
  }

  function consume(): SearchToken | undefined {
    const token = tokens[cursor];
    cursor += 1;
    return token;
  }

  function resolveFieldName(fieldName: string): string {
    if (!searchConfig) {
      return fieldName;
    }

    return searchConfig.fields[fieldName]
      ? fieldName
      : (searchConfig.aliases[fieldName] ?? fieldName);
  }

  function parseClause(): StreamSearchNode | null {
    const currentToken = peek();

    if (!currentToken) {
      return null;
    }

    if (
      currentToken.type === "word" &&
      peek(1)?.type === "colon" &&
      (peek(2)?.type === "word" || peek(2)?.type === "string")
    ) {
      const fieldToken = consume();
      consume();
      const valueToken = consume();

      if (
        !fieldToken ||
        fieldToken.type !== "word" ||
        !valueToken ||
        (valueToken.type !== "string" && valueToken.type !== "word")
      ) {
        return null;
      }

      const resolvedFieldName = resolveFieldName(fieldToken.value);

      if (fieldToken.value === "has") {
        return {
          clause: {
            field: resolveFieldName(valueToken.value),
            kind: "exists",
          },
          kind: "clause",
        };
      }

      if (valueToken.type === "string") {
        return {
          clause: {
            field: resolvedFieldName,
            kind: "phrase",
            value: valueToken.value,
          },
          kind: "clause",
        };
      }

      const rangeMatch = /^(<=|>=|=|<|>)(.+)$/.exec(valueToken.value);

      if (rangeMatch) {
        return {
          clause: {
            field: resolvedFieldName,
            kind: "range",
            operator: rangeMatch[1] as "<" | "<=" | "=" | ">" | ">=",
            value: rangeMatch[2] ?? "",
          },
          kind: "clause",
        };
      }

      if (valueToken.value.endsWith("*")) {
        return {
          clause: {
            field: resolvedFieldName,
            kind: "prefix",
            value: valueToken.value.slice(0, -1),
          },
          kind: "clause",
        };
      }

      return {
        clause: {
          field: resolvedFieldName,
          kind: "term",
          value: valueToken.value,
        },
        kind: "clause",
      };
    }

    if (currentToken.type === "string" || currentToken.type === "word") {
      consume();

      const isBarePrefixClause =
        currentToken.type === "word" &&
        currentToken.value.endsWith("*") &&
        currentToken.value.length > 1;

      return {
        clause: {
          field: null,
          kind:
            currentToken.type === "string"
              ? "phrase"
              : isBarePrefixClause
                ? "prefix"
                : "term",
          value: isBarePrefixClause
            ? currentToken.value.slice(0, -1)
            : currentToken.value,
        },
        kind: "clause",
      };
    }

    return null;
  }

  function parsePrimary(): StreamSearchNode | null {
    if (peek()?.type === "lparen") {
      consume();
      const expression = parseOr();

      if (peek()?.type === "rparen") {
        consume();
      }

      return expression;
    }

    return parseClause();
  }

  function parseUnary(): StreamSearchNode | null {
    if (peek()?.type === "not" || peek()?.type === "minus") {
      consume();
      const clause = parseUnary();

      return clause
        ? {
            clause,
            kind: "not",
          }
        : null;
    }

    return parsePrimary();
  }

  function isImplicitAndBoundary(token: SearchToken | undefined): boolean {
    return (
      token?.type === "word" ||
      token?.type === "string" ||
      token?.type === "lparen" ||
      token?.type === "minus" ||
      token?.type === "not"
    );
  }

  function parseAnd(): StreamSearchNode | null {
    const clauses: StreamSearchNode[] = [];
    let clause = parseUnary();

    if (!clause) {
      return null;
    }

    clauses.push(clause);

    let shouldContinue = true;

    while (shouldContinue) {
      if (peek()?.type === "and") {
        consume();
        clause = parseUnary();
      } else if (isImplicitAndBoundary(peek())) {
        clause = parseUnary();
      } else {
        shouldContinue = false;
        continue;
      }

      if (!clause) {
        break;
      }

      clauses.push(clause);
    }

    return clauses.length === 1
      ? (clauses[0] ?? null)
      : {
          clauses,
          kind: "and",
        };
  }

  function parseOr(): StreamSearchNode | null {
    const clauses: StreamSearchNode[] = [];
    let clause = parseAnd();

    if (!clause) {
      return null;
    }

    clauses.push(clause);

    while (peek()?.type === "or") {
      consume();
      clause = parseAnd();

      if (!clause) {
        break;
      }

      clauses.push(clause);
    }

    return clauses.length === 1
      ? (clauses[0] ?? null)
      : {
          clauses,
          kind: "or",
        };
  }

  return parseOr();
}

function collectPositiveClauses(
  node: StreamSearchNode | null,
  negated = false,
): StreamSearchClause[] {
  if (!node) {
    return [];
  }

  if (node.kind === "not") {
    return collectPositiveClauses(node.clause, !negated);
  }

  if (node.kind === "and" || node.kind === "or") {
    const clauses: StreamSearchClause[] = [];

    for (const clause of node.clauses) {
      clauses.push(...collectPositiveClauses(clause, negated));
    }

    return clauses;
  }

  const clauses: StreamSearchClause[] = [];

  if (!negated && node.kind === "clause") {
    clauses.push(node.clause);
  }

  return clauses;
}

function getClauseBindingPaths(
  clause: StreamSearchClause,
  searchConfig: StudioStreamSearchConfig | null | undefined,
): string[] {
  if (clause.field) {
    const field = searchConfig?.fields[clause.field];

    if (!field) {
      return [`/${escapeJsonPointerSegment(clause.field)}`];
    }

    return field.bindings.map((binding) => binding.jsonPointer);
  }

  if (!searchConfig) {
    return [];
  }

  const defaultFields =
    searchConfig.defaultFields.length > 0
      ? searchConfig.defaultFields.map((field) => field.field)
      : Object.entries(searchConfig.fields)
          .filter(([_fieldName, field]) => field.kind === "text")
          .map(([fieldName]) => fieldName);

  return defaultFields.flatMap(
    (fieldName) =>
      searchConfig.fields[fieldName]?.bindings.map(
        (binding) => binding.jsonPointer,
      ) ?? [],
  );
}

function createStreamSearchHighlighter(args: {
  searchConfig: StudioStreamSearchConfig | null | undefined;
  searchQuery: string;
}): StreamSearchHighlighter | null {
  const parsedQuery = parseStreamSearchQuery(
    args.searchQuery,
    args.searchConfig,
  );
  const clauses = collectPositiveClauses(parsedQuery);

  if (clauses.length === 0) {
    return null;
  }

  const fieldPaths = new Set<string>();
  const valueRules: StreamValueHighlightRule[] = [];

  for (const clause of clauses) {
    const bindingPaths = getClauseBindingPaths(clause, args.searchConfig);
    const fieldConfig =
      clause.field && args.searchConfig
        ? args.searchConfig.fields[clause.field]
        : undefined;

    for (const path of bindingPaths) {
      if (clause.field) {
        fieldPaths.add(path);
      }
      valueRules.push({
        fieldKind: fieldConfig?.kind ?? null,
        kind: clause.kind,
        operator: clause.kind === "range" ? clause.operator : undefined,
        path,
        value: "value" in clause ? clause.value : undefined,
      });
    }
  }

  return {
    fieldPaths,
    valueRules,
  };
}

function pathMatchesRule(rulePath: string, currentPath: string): boolean {
  return currentPath === rulePath || currentPath.startsWith(`${rulePath}/`);
}

function parseComparableValue(
  value: unknown,
  fieldKind: StudioStreamSearchFieldKind | null,
): number | string | null {
  if (fieldKind === "date") {
    if (typeof value === "string") {
      const timestamp = Date.parse(value);

      return Number.isNaN(timestamp) ? null : timestamp;
    }

    return null;
  }

  if (
    fieldKind === "float" ||
    fieldKind === "integer" ||
    fieldKind === "bool"
  ) {
    const numericValue =
      typeof value === "number"
        ? value
        : typeof value === "boolean"
          ? Number(value)
          : typeof value === "string"
            ? Number(value)
            : null;

    return numericValue != null && Number.isFinite(numericValue)
      ? numericValue
      : null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value).toLowerCase();
  }

  return null;
}

function matchesRangeRule(
  value: unknown,
  rule: StreamValueHighlightRule,
): boolean {
  if (rule.kind !== "range" || !rule.operator || !rule.value) {
    return false;
  }

  const left = parseComparableValue(value, rule.fieldKind);
  const right = parseComparableValue(rule.value, rule.fieldKind);

  if (left == null || right == null) {
    return false;
  }

  switch (rule.operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case "=":
      return left === right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}

function getMatchRanges(text: string, matchText: string): MatchRange[] {
  if (!matchText) {
    return [];
  }

  const lowerText = text.toLowerCase();
  const lowerMatchText = matchText.toLowerCase();
  const ranges: MatchRange[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerMatchText, cursor);

  while (matchIndex !== -1) {
    const end = matchIndex + matchText.length;

    ranges.push({
      end,
      start: matchIndex,
    });

    cursor = end;
    matchIndex = lowerText.indexOf(lowerMatchText, cursor);
  }

  return ranges;
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length === 0) {
    return [];
  }

  const sortedRanges = [...ranges].sort(
    (left, right) => left.start - right.start,
  );
  const mergedRanges: MatchRange[] = [sortedRanges[0]!];

  for (const range of sortedRanges.slice(1)) {
    const previousRange = mergedRanges.at(-1);

    if (!previousRange) {
      mergedRanges.push(range);
      continue;
    }

    if (range.start <= previousRange.end) {
      previousRange.end = Math.max(previousRange.end, range.end);
      continue;
    }

    mergedRanges.push({ ...range });
  }

  return mergedRanges;
}

function highlightText(text: string, ranges: MatchRange[]): ReactNode {
  if (ranges.length === 0) {
    return text;
  }

  const mergedRanges = mergeRanges(ranges);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const range of mergedRanges) {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }

    nodes.push(
      <mark
        key={`${range.start}:${range.end}`}
        className={SEARCH_MATCH_CLASS_NAME}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return <>{nodes}</>;
}

function getTextHighlightRanges(args: {
  highlighter: StreamSearchHighlighter;
  path: string;
  value: string;
}): MatchRange[] {
  const { highlighter, path, value } = args;

  return highlighter.valueRules.flatMap((rule) => {
    if (!pathMatchesRule(rule.path, path) || !rule.value) {
      return [];
    }

    if (rule.kind === "phrase" || rule.kind === "term") {
      return getMatchRanges(value, rule.value);
    }

    if (rule.kind === "prefix") {
      return value.toLowerCase().startsWith(rule.value.toLowerCase())
        ? [{ end: rule.value.length, start: 0 }]
        : [];
    }

    return [];
  });
}

function renderJsonValue(args: {
  depth: number;
  highlighter: StreamSearchHighlighter | null;
  path: string;
  seen: WeakSet<object>;
  value: unknown;
}): ReactNode {
  const { depth, highlighter, path, seen, value } = args;
  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    const ranges = highlighter
      ? getTextHighlightRanges({
          highlighter,
          path,
          value,
        })
      : [];

    return (
      <>
        {'"'}
        {highlightText(value, ranges)}
        {'"'}
      </>
    );
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    const valueText = String(value);
    const shouldHighlight =
      highlighter?.valueRules.some(
        (rule) =>
          pathMatchesRule(rule.path, path) && matchesRangeRule(value, rule),
      ) ?? false;

    return shouldHighlight ? (
      <mark className={SEARCH_MATCH_CLASS_NAME}>{valueText}</mark>
    ) : (
      valueText
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return (
      <>
        [{"\n"}
        {value.map((item, index) => (
          <Fragment key={index}>
            {childIndent}
            {renderJsonValue({
              depth: depth + 1,
              highlighter,
              path: `${path}/${index}`,
              seen,
              value: item,
            })}
            {index < value.length - 1 ? "," : ""}
            {"\n"}
          </Fragment>
        ))}
        {indent}]
      </>
    );
  }

  if (!isRecord(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return '"[Circular]"';
  }

  seen.add(value);

  const entries = Object.entries(value);

  if (entries.length === 0) {
    return "{}";
  }

  return (
    <>
      {"{"}
      {"\n"}
      {entries.map(([key, entryValue], index) => {
        const entryPath = `${path}/${escapeJsonPointerSegment(key)}`;
        const isFieldHighlighted =
          highlighter?.fieldPaths.has(entryPath) ?? false;

        return (
          <Fragment key={entryPath}>
            {childIndent}
            {isFieldHighlighted ? (
              <mark className={SEARCH_MATCH_CLASS_NAME}>{`"${key}"`}</mark>
            ) : (
              `"${key}"`
            )}
            :{" "}
            {renderJsonValue({
              depth: depth + 1,
              highlighter,
              path: entryPath,
              seen,
              value: entryValue,
            })}
            {index < entries.length - 1 ? "," : ""}
            {"\n"}
          </Fragment>
        );
      })}
      {indent}
      {"}"}
    </>
  );
}

export function HighlightedStreamEventJson(props: {
  searchConfig: StudioStreamSearchConfig | null | undefined;
  searchQuery: string;
  value: unknown;
}) {
  const { searchConfig, searchQuery, value } = props;
  const highlighter = createStreamSearchHighlighter({
    searchConfig,
    searchQuery,
  });

  return (
    <>
      {renderJsonValue({
        depth: 0,
        highlighter,
        path: "",
        seen: new WeakSet(),
        value,
      })}
    </>
  );
}
