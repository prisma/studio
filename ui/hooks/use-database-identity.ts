import { useEffect } from "react";

import type { SqlEditorDialect } from "../../data/adapter";
import { useStudio } from "../studio/context";
import { useIntrospection } from "./use-introspection";

export interface DatabaseIdentity {
  /** What Studio shows: the host's label, else the introspected name. */
  label: string;
  /** The name the database itself reports, when known. */
  databaseName?: string;
  /** Human name of the database engine, e.g. `PostgreSQL`. */
  engine?: string;
}

const ENGINE_NAMES: Record<SqlEditorDialect, string> = {
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  sqlite: "SQLite",
};

/**
 * Which database this Studio is connected to.
 *
 * The embedder's `databaseLabel` wins because it can name things the database
 * cannot, such as the host or the Console project and branch. Without one,
 * the name the database reports during introspection is used.
 */
export function useDatabaseIdentity(): DatabaseIdentity | null {
  const { adapter, databaseLabel } = useStudio();
  const { data, hasResolvedIntrospection } = useIntrospection();

  // Placeholder data after a failed first load must not name a database.
  const databaseName = hasResolvedIntrospection
    ? data.databaseName?.trim() || undefined
    : undefined;
  const label = databaseLabel ?? databaseName;

  if (!label) {
    return null;
  }

  const dialect = adapter?.capabilities?.sqlDialect;

  return {
    label,
    ...(databaseName ? { databaseName } : {}),
    ...(dialect ? { engine: ENGINE_NAMES[dialect] } : {}),
  };
}

/**
 * Puts the database label in the browser tab title, so tabs connected to
 * different databases can be told apart. Only active when the embedder opts
 * in with `documentTitle`, since hosts like Console own their tab title.
 * The previous title is restored when Studio unmounts.
 */
export function useDatabaseDocumentTitle() {
  const { documentTitle } = useStudio();
  const label = useDatabaseIdentity()?.label;

  useEffect(() => {
    if (!documentTitle || !label) {
      return;
    }

    const previousTitle = document.title;
    document.title = `${label} · Prisma Studio`;

    return () => {
      document.title = previousTitle;
    };
  }, [documentTitle, label]);
}
