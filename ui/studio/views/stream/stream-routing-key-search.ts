import type {
  StudioStreamRoutingKeyConfig,
  StudioStreamSearchConfig,
} from "../../../hooks/use-stream-details";

export interface ResolvedRoutingKeySearchField {
  fieldName: string;
  jsonPointer: string;
  queryFieldName: string;
  required: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPreferredQueryFieldName(
  searchConfig: StudioStreamSearchConfig,
  fieldName: string,
): string {
  const aliases = Object.entries(searchConfig.aliases)
    .filter(([_alias, targetFieldName]) => targetFieldName === fieldName)
    .map(([alias]) => alias);

  return [...aliases, fieldName].sort((left, right) => {
    if (left.length !== right.length) {
      return left.length - right.length;
    }

    return left.localeCompare(right);
  })[0]!;
}

export function resolveRoutingKeySearchField(args: {
  routingKey: StudioStreamRoutingKeyConfig | null | undefined;
  searchConfig: StudioStreamSearchConfig | null | undefined;
}): ResolvedRoutingKeySearchField | null {
  const { routingKey, searchConfig } = args;

  if (!routingKey || !searchConfig) {
    return null;
  }

  const candidates = Object.entries(searchConfig.fields)
    .filter(([_fieldName, field]) => {
      return (
        field.kind === "keyword" &&
        field.exact &&
        field.bindings.some(
          (binding) => binding.jsonPointer === routingKey.jsonPointer,
        )
      );
    })
    .map(([fieldName]) => ({
      fieldName,
      jsonPointer: routingKey.jsonPointer,
      queryFieldName: getPreferredQueryFieldName(searchConfig, fieldName),
      required: routingKey.required,
    }))
    .sort((left, right) => {
      if (left.queryFieldName.length !== right.queryFieldName.length) {
        return left.queryFieldName.length - right.queryFieldName.length;
      }

      const queryFieldComparison = left.queryFieldName.localeCompare(
        right.queryFieldName,
      );

      if (queryFieldComparison !== 0) {
        return queryFieldComparison;
      }

      return left.fieldName.localeCompare(right.fieldName);
    });

  return candidates[0] ?? null;
}

export function buildRoutingKeySearchClause(args: {
  queryFieldName: string;
  routingKey: string;
}): string {
  return `${args.queryFieldName}:${JSON.stringify(args.routingKey)}`;
}

function stripControlledRoutingKeyClause(args: {
  currentSearchTerm: string;
  queryFieldName: string;
}): string {
  const trimmedSearchTerm = args.currentSearchTerm.trim();

  if (trimmedSearchTerm.length === 0) {
    return "";
  }

  const fieldPattern = escapeRegExp(args.queryFieldName);
  const stringLiteralPattern = '"(?:[^"\\\\]|\\\\.)*"';
  const bareValuePattern = "[^\\s()]+";
  const clausePattern = `${fieldPattern}:(?:${stringLiteralPattern}|${bareValuePattern})`;

  if (new RegExp(`^${clausePattern}$`, "s").test(trimmedSearchTerm)) {
    return "";
  }

  const wrappedMatch = trimmedSearchTerm.match(
    new RegExp(`^${clausePattern}\\s+AND\\s+\\((.*)\\)$`, "s"),
  );

  return wrappedMatch?.[1]?.trim() ?? trimmedSearchTerm;
}

export function applyRoutingKeySearchSelection(args: {
  currentSearchTerm: string;
  queryFieldName: string;
  routingKey: string;
}): string {
  const clause = buildRoutingKeySearchClause(args);
  const baseSearchTerm = stripControlledRoutingKeyClause(args);

  return baseSearchTerm.length > 0
    ? `${clause} AND (${baseSearchTerm})`
    : clause;
}

export function createRoutingKeysAfterCursorForPrefix(
  prefix: string,
): string | null {
  if (prefix.length === 0) {
    return null;
  }

  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    const codeUnit = prefix.charCodeAt(index);

    if (codeUnit === 0) {
      continue;
    }

    return `${prefix.slice(0, index)}${String.fromCharCode(codeUnit - 1)}\uffff`;
  }

  return null;
}

export function createRoutingKeysPrefixUpperBound(
  prefix: string,
): string | null {
  if (prefix.length === 0) {
    return null;
  }

  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    const codeUnit = prefix.charCodeAt(index);

    if (codeUnit === 0xffff) {
      continue;
    }

    return `${prefix.slice(0, index)}${String.fromCharCode(codeUnit + 1)}`;
  }

  return null;
}
