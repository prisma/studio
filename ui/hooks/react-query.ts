import "@tanstack/react-query";

import type { PrismaTablesSchema } from "../../data/prisma-tables-schema";

type SchemaAndTable = ["schema", string | null, "table", string | null];

type MutationKey =
  | [...SchemaAndTable, "delete" | "insert" | "update"]
  | [...SchemaAndTable, "update-many"];

type QueryKey =
  | [] // all
  | ["introspection"]
  | [
      "prisma-next-migrations",
      PrismaTablesSchema | null,
      "contract-table",
      boolean,
    ]
  | ["prisma-next-migrations-probe", PrismaTablesSchema | null]
  | ["stream-details", string]
  | ["stream-routing-keys", string, "stream", string, "prefix", string]
  | ["streams-server-details", string]
  | [
      "stream-aggregations",
      string,
      "stream",
      string,
      "rollup",
      string,
      "range",
      string,
    ]
  | ["stream-search-metadata", string]
  | ["stream-routing-key-read-metadata", string]
  | ["stream-search-head", string, number, string, string, string]
  | [
      "stream-observe-request",
      string,
      "events",
      string,
      "traces",
      string,
      "lookup",
      string,
      string,
    ]
  | ["streams", string]
  // Every Temporal key starts with the BFF's URL, then the namespace where
  // one applies, then whatever narrows the request.
  | [
      "temporal",
      (
        | "attention"
        | "bulk-job"
        | "capabilities"
        | "cluster-overview"
        | "cluster-traces"
        | "facets"
        | "namespaces"
        | "schedule-detail"
        | "schedules"
        | "task-queues"
        | "type-inputs"
        | "type-map"
        | "workers"
        | "workflow-detail"
        | "workflow-metadata"
        | "workflow-runs"
        | "workflow-stack"
        | "workflows"
      ),
      string | undefined,
      ...Array<number | string | undefined>,
    ]
  | [
      "streams",
      string,
      "stream",
      string,
      "epoch",
      number,
      "visibleEventCount",
      string,
      "routingKey",
      string,
      "pageSize",
      number,
      "pageCount",
      number,
    ]
  | [
      "streams",
      string,
      "stream",
      string,
      "epoch",
      number,
      "routingKeyRead",
      string,
      "requestedResultCount",
      number,
    ]
  | [
      "streams",
      string,
      "stream",
      string,
      "epoch",
      number,
      "search",
      string,
      "sort",
      string,
      "visibleSearchResultCount",
      string,
      "pageSize",
      number,
    ]
  | [
      ...SchemaAndTable,
      "query",
      "sortOrder",
      "natural" | (string & {}),
      "pageIndex",
      number,
      "pageSize",
      number,
      "filter",
      string,
    ];

declare module "@tanstack/react-query" {
  // See: https://tanstack.com/query/v5/docs/framework/react/typescript#registering-the-query-and-mutation-key-types
  interface Register {
    mutationKey: MutationKey;
    queryKey: QueryKey;
  }
}
