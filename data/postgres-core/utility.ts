import { asQuery, type Query } from "../query";

export function getPIDQuery(): Query<{ pid: unknown }> {
  return asQuery("select pg_backend_pid() as pid");
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function getCancelQuery(pid: {}): Query<unknown> {
  return {
    parameters: [pid],
    sql: "select pg_cancel_backend($1);",
  };
}
