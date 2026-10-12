import { useEffect, useMemo, useState } from "react";

import type { StudioMigrationOperation } from "../../data/migrations";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";
import { parseContractSnapshot } from "./contract-diff";
import {
  diffSchemas,
  renderPslSchema,
  schemaDiffHasChanges,
  type SchemaDiffLine,
} from "./psl-schema";

export function SchemaDiffSqlPanel(props: {
  operations: readonly StudioMigrationOperation[];
}) {
  const { operations } = props;

  return (
    <div data-testid="migration-sql-panel">
      <div className="flex flex-col gap-3">
        {operations.map((operation, index) => (
          <div key={`${index}-${operation.id}`} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  operation.operationClass === "destructive"
                    ? "destructive"
                    : "secondary"
                }
                className="text-[10px]"
              >
                {operation.operationClass}
              </Badge>
              <span className="text-xs font-medium text-foreground">
                {operation.label}
              </span>
            </div>
            {operation.statements.map((statement, index) => (
              <pre
                key={index}
                className="overflow-x-auto rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-foreground"
              >
                {statement}
              </pre>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const SCHEMA_DIFF_LINE_STYLES: Record<
  SchemaDiffLine["kind"],
  { row: string; gutter: string; symbol: string }
> = {
  added: {
    row: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    gutter: "text-emerald-600 dark:text-emerald-400",
    symbol: "+",
  },
  removed: {
    row: "bg-rose-500/10 text-rose-800 dark:text-rose-200",
    gutter: "text-rose-600 dark:text-rose-400",
    symbol: "−",
  },
  context: {
    row: "text-muted-foreground",
    gutter: "text-transparent",
    symbol: " ",
  },
  collapsed: {
    row: "text-muted-foreground/60 italic",
    gutter: "text-transparent",
    symbol: " ",
  },
};

function SchemaDiffRow(props: { line: SchemaDiffLine }) {
  const { line } = props;

  return (
    <div
      className={cn(
        "flex gap-2 px-3 font-mono text-[11px] leading-relaxed",
        SCHEMA_DIFF_LINE_STYLES[line.kind].row,
      )}
    >
      <span
        className={cn(
          "w-3 shrink-0 select-none text-center",
          SCHEMA_DIFF_LINE_STYLES[line.kind].gutter,
        )}
      >
        {SCHEMA_DIFF_LINE_STYLES[line.kind].symbol}
      </span>
      <span className="whitespace-pre">{line.text}</span>
    </div>
  );
}

export function SchemaDiffSchemaPanel(props: {
  mode?: "schema" | "diff";
  before: unknown;
  after: unknown;
}) {
  const { before, after, mode } = props;
  const lines = useMemo(
    () =>
      diffSchemas(
        renderPslSchema(parseContractSnapshot(before)),
        renderPslSchema(parseContractSnapshot(after)),
      ),
    [before, after],
  );
  const [expandedFolds, setExpandedFolds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  useEffect(() => setExpandedFolds(new Set()), [lines]);

  return (
    <div data-testid="migration-schema-panel">
      {mode === "schema" ? (
        <pre className="overflow-x-auto rounded-md border border-border/70 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
          {renderPslSchema(parseContractSnapshot(after))}
        </pre>
      ) : schemaDiffHasChanges(lines) ? (
        <div className="overflow-hidden rounded-md border border-border/70 bg-muted/30">
          {lines.map((line, index) => {
            if (line.kind !== "collapsed") {
              return <SchemaDiffRow key={index} line={line} />;
            }

            if (expandedFolds.has(index)) {
              return (line.hiddenLines ?? []).map((text, hiddenIndex) => (
                <SchemaDiffRow
                  key={`${index}-${hiddenIndex}`}
                  line={{ kind: "context", text }}
                />
              ));
            }

            return (
              <button
                key={index}
                className={cn(
                  "group block w-full cursor-pointer px-3 py-1 text-center font-mono text-[10px] transition-colors hover:bg-muted/60 hover:text-muted-foreground",
                  SCHEMA_DIFF_LINE_STYLES.collapsed.row,
                )}
                data-testid="schema-diff-expand"
                onClick={() =>
                  setExpandedFolds((previous) => new Set([...previous, index]))
                }
                type="button"
              >
                ⋯ {line.hiddenCount} unchanged line
                {line.hiddenCount === 1 ? "" : "s"}
                <span className="not-italic text-muted-foreground/40 transition-colors group-hover:text-muted-foreground">
                  {" "}
                  · expand
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-muted-foreground">
          No schema changes.
        </div>
      )}
    </div>
  );
}
