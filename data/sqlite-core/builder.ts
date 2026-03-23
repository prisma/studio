import { type Kysely, SqliteAdapter, SqliteQueryCompiler } from "kysely";

import { type BuilderRequirements, getBuilder } from "../query";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSQLiteBuilder<Database = any>(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
): Kysely<Database> {
  return getBuilder<Database>({
    ...requirements,
    Adapter: SqliteAdapter,
    QueryCompiler: SqliteQueryCompiler,
  });
}
