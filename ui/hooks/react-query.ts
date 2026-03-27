import "@tanstack/react-query";

type SchemaAndTable = ["schema", string | null, "table", string | null];

type MutationKey =
  | [...SchemaAndTable, "delete" | "insert" | "update"]
  | [...SchemaAndTable, "update-many"];

type QueryKey =
  | [] // all
  | ["introspection"]
  | ["stream-details", string]
  | ["stream-aggregations", string, "stream", string, "rollup", string, "range", string]
  | ["streams", string]
  | [
      "streams",
      string,
      "stream",
      string,
      "epoch",
      number,
      "visibleEventCount",
      string,
      "pageSize",
      number,
      "pageCount",
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
