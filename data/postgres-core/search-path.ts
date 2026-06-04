export function createPostgresSearchPath(
  schema: string | undefined,
): string | null {
  if (schema === undefined || schema.length === 0) {
    return null;
  }

  const quotedSchema = quotePostgresSearchPathIdentifier(schema);

  if (schema === "public") {
    return quotedSchema;
  }

  return `${quotedSchema}, public`;
}

function quotePostgresSearchPathIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
