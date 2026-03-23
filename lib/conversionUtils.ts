import type { Column, FilterOperator } from "@/data";

const TEXT_MATCH_OPERATORS = new Set<FilterOperator>([
  "like",
  "not like",
  "ilike",
  "not ilike",
]);

export function coerceToValue(
  column: Column | undefined,
  operator: FilterOperator,
  value: string,
): unknown {
  const dataTypeGroup = column?.datatype.group;

  if (dataTypeGroup === undefined) {
    return "";
  }

  if (operator === "is" || operator === "is not") {
    return value.toLowerCase() === "null" ? null : value;
  }

  if (
    column?.datatype.isArray &&
    operator != null &&
    !TEXT_MATCH_OPERATORS.has(operator)
  ) {
    try {
      const parsed = JSON.parse(value) as unknown;

      return Array.isArray(parsed) ? parsed : value;
    } catch {
      return value;
    }
  }

  if (dataTypeGroup === "boolean") return value === "true";
  if (dataTypeGroup === "datetime") return value;
  if (dataTypeGroup === "enum") return value;
  if (dataTypeGroup === "raw") return value;
  if (dataTypeGroup === "string") return value;
  if (dataTypeGroup === "time") return value;

  if (dataTypeGroup === "json") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  if (dataTypeGroup === "numeric") {
    return value === "" ? null : Number(value);
  }

  return value;
}

export function coerceToString(
  column: Column | undefined,
  operator: FilterOperator | undefined,
  value: unknown,
): string {
  const dataTypeGroup = column?.datatype.group;

  if (operator && (operator === "is" || operator === "is not")) {
    return value === null ? "null" : String(value);
  }

  if (dataTypeGroup === undefined || value == null) {
    return "";
  }

  if (
    column?.datatype.isArray &&
    operator != null &&
    !TEXT_MATCH_OPERATORS.has(operator)
  ) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  if (dataTypeGroup === "boolean") return String(value);
  if (dataTypeGroup === "datetime") return String(value);
  if (dataTypeGroup === "enum") return String(value);
  if (dataTypeGroup === "numeric") return String(value);
  if (dataTypeGroup === "raw") return String(value);
  if (dataTypeGroup === "string") return String(value);
  if (dataTypeGroup === "time") return String(value);

  if (dataTypeGroup === "json") {
    if (value === "") return "";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}
