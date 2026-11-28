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
 * Studios on this page that currently own the tab title, oldest first, and
 * the host's title from before the first of them took over. The newest owner
 * shows its title; when owners leave, the next one (or the host) gets it back.
 */
const titleOwners: Array<{ title: string }> = [];
let hostTitle: string | null = null;

function applyOwnedTitle() {
  const owner = titleOwners.at(-1);

  if (owner) {
    document.title = owner.title;
    return;
  }

  if (hostTitle !== null) {
    document.title = hostTitle;
    hostTitle = null;
  }
}

/**
 * Puts the database label in the browser tab title, so tabs connected to
 * different databases can be told apart. Only active when the embedder opts
 * in with `documentTitle`, since hosts like Console own their tab title.
 * The host's title comes back when the last such Studio unmounts.
 */
export function useDatabaseDocumentTitle() {
  const { documentTitle } = useStudio();
  const label = useDatabaseIdentity()?.label;

  useEffect(() => {
    if (!documentTitle || !label) {
      return;
    }

    if (titleOwners.length === 0) {
      hostTitle = document.title;
    }

    const owner = { title: `${label} · Prisma Studio` };
    titleOwners.push(owner);
    applyOwnedTitle();

    return () => {
      const index = titleOwners.indexOf(owner);

      if (index !== -1) {
        titleOwners.splice(index, 1);
      }

      applyOwnedTitle();
    };
  }, [documentTitle, label]);
}
