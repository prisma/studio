import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Schema } from "../../data/adapter";
import { PRISMA_TABLES_SCHEMAS } from "../../data/prisma-tables-schema";
import { useHasMigrationHistory, useMigrations } from "./use-migrations";

const rawMock =
  vi.fn<(query: { sql: string }) => Promise<[null, { rows: unknown[] }]>>();
const schemasMock = vi.fn<() => Record<string, Schema>>();

vi.mock("../studio/context", () => ({
  useStudio: () => ({ adapter: { raw: rawMock } }),
}));

vi.mock("./use-introspection", () => ({
  useIntrospection: () => ({ data: { schemas: schemasMock() } }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function introspectedSchema(name: string, tableNames: string[]): Schema {
  return {
    name,
    tables: Object.fromEntries(
      tableNames.map((table) => [
        table,
        { columns: {}, name: table, schema: name },
      ]),
    ),
  };
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  rawMock.mockReset();
});

async function renderMigrationHooks() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient();

  function Harness() {
    useHasMigrationHistory();
    useMigrations();
    return null;
  }

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  cleanup = () => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  };

  return queryClient;
}

describe.each(PRISMA_TABLES_SCHEMAS)(
  "migration hooks with Prisma's tables in the %s schema",
  (schema) => {
    it("probe for rows and load the ledger from that schema, keyed by it", async () => {
      const otherSchema = PRISMA_TABLES_SCHEMAS.find(
        (candidate) => candidate !== schema,
      );
      schemasMock.mockReturnValue({
        public: introspectedSchema("public", ["User"]),
        [schema]: introspectedSchema(schema, ["ledger", "contract"]),
      });
      rawMock.mockResolvedValue([null, { rows: [] }]);

      const queryClient = await renderMigrationHooks();

      const statements = rawMock.mock.calls.map(([query]) => query.sql);
      expect(statements).toHaveLength(2);
      expect(statements).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            `select exists (select 1 from "${schema}"."ledger")`,
          ),
          expect.stringContaining(`left join "${schema}"."contract" cb`),
        ]),
      );
      for (const statement of statements) {
        expect(statement).not.toContain(`"${otherSchema}"`);
      }
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey),
      ).toEqual(
        expect.arrayContaining([
          ["prisma-next-migrations-probe", schema],
          ["prisma-next-migrations", schema, "contract-table", true],
        ]),
      );
    });
  },
);
