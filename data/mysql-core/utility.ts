import type { Query } from "../query";

export function getCancelQuery(threadId: unknown): Query<unknown> {
  return {
    parameters: [threadId],
    sql: "kill ?",
  };
}
