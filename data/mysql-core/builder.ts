import { type Kysely, MysqlAdapter, MysqlQueryCompiler } from "kysely";

import { type BuilderRequirements, getBuilder } from "../query";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMySQLBuilder<Database = any>(
  requirements?: Omit<BuilderRequirements, "Adapter" | "QueryCompiler">,
): Kysely<Database> {
  return getBuilder({
    ...requirements,
    Adapter: MysqlAdapter,
    QueryCompiler: MysqlQueryCompiler,
  });
}
