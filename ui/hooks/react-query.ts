import "@tanstack/react-query";

type SchemaAndTable = ["schema", string | null, "table", string | null];

type MutationKey =
  | [...SchemaAndTable, "delete" | "insert" | "update"]
  | [...SchemaAndTable, "update-many"];

type QueryKey =
  | [] // all
  | ["introspection"]
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
