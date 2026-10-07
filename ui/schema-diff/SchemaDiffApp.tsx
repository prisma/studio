import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useState } from "react";

import type { SchemaComparison } from "../../data/migrations";
import { SchemaDiff } from "./SchemaDiff";

function parseComparison(value: unknown): SchemaComparison | null {
  if (!value || typeof value !== "object" || !("schema" in value)) return null;
  const schema = value.schema;
  if (
    !schema ||
    typeof schema !== "object" ||
    !("status" in schema) ||
    !("title" in schema) ||
    !("fromLabel" in schema) ||
    !("toLabel" in schema) ||
    !("mode" in schema)
  )
    return null;
  if (
    (schema.status !== "available" && schema.status !== "unavailable") ||
    typeof schema.title !== "string" ||
    typeof schema.fromLabel !== "string" ||
    typeof schema.toLabel !== "string" ||
    (schema.mode !== "schema" && schema.mode !== "diff")
  )
    return null;
  return {
    status: schema.status,
    title: schema.title,
    fromLabel: schema.fromLabel,
    toLabel: schema.toLabel,
    mode: schema.mode,
    before: "before" in schema ? schema.before : null,
    after: "after" in schema ? schema.after : null,
    message:
      "message" in schema && typeof schema.message === "string"
        ? schema.message
        : undefined,
  };
}

/** MCP Apps bridge for the same recorded-contract UI used by Studio and Console. */
export function SchemaDiffApp() {
  const [schema, setSchema] = useState<SchemaComparison | null>(null);
  const [message, setMessage] = useState("Loading database schema…");
  const [theme, setTheme] = useState("light");
  const { app, error } = useApp({
    appInfo: { name: "Prisma database schema", version: "1.0.0" },
    capabilities: {},
    autoResize: false,
    onAppCreated: (instance) => {
      instance.ontoolinput = () => {
        setSchema(null);
        setMessage("Loading database schema…");
      };
      instance.ontoolresult = (result) => {
        const comparison = result.isError
          ? null
          : parseComparison(result.structuredContent);
        setSchema(comparison);
        setMessage(
          comparison?.message ?? "Database schema could not be loaded.",
        );
      };
      instance.ontoolcancelled = () => {
        setSchema(null);
        setMessage("Schema request cancelled.");
      };
      instance.onhostcontextchanged = (context) => {
        if (context.theme) setTheme(context.theme);
      };
    },
  });
  useEffect(() => {
    if (app) {
      setTheme(app.getHostContext()?.theme ?? "light");
      void app.sendSizeChanged({ height: 600 });
    }
  }, [app]);
  return (
    <div
      className={`ps ${theme === "dark" ? "dark" : ""}`}
      style={{ height: 600 }}
    >
      {schema?.status === "available" ? (
        <SchemaDiff {...schema} scoped={false} />
      ) : (
        <div
          role="status"
          className="flex h-full items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground"
        >
          {error ? "Could not connect to the app host." : message}
        </div>
      )}
    </div>
  );
}
