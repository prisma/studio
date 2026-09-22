import type { Query } from "@/data/query";

/**
 * Build a short, human-readable preview of a failed query's SQL for error
 * notices. Returns `null` when the error carries no SQL to preview.
 */
export function getQueryPreview(
  query: Query<unknown> | undefined,
): string | null {
  if (!query?.sql) {
    return null;
  }

  const preview = query.sql.slice(0, 120);
  return query.sql.length > 120 ? `${preview}...` : preview;
}
