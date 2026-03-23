import { type Kysely, PostgresAdapter, PostgresQueryCompiler } from "kysely";

import { type BuilderRequirements, getBuilder } from "../query";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPostgreSQLBuilder<Database = any>(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
): Kysely<Database> {
  return getBuilder({
    ...requirements,
    Adapter: PostgresAdapter,
    QueryCompiler: PostgresQueryCompiler,
  });
}
