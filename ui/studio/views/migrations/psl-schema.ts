import { diffLines } from "diff";

import type { ContractSnapshot, SnapshotModel } from "./contract-diff";

/**
 * Renders a Prisma-schema-style view of a contract snapshot and diffs
 * two snapshots line by line for the Migrations view's schema panel.
 *
 * The output is a faithful PSL-shaped projection of the contract (model
 * and enum blocks, field types, defaults, relations, index/unique/map
 * attributes), optimized for stable diffs: fields are consistently
 * ordered and separated by single runs of spaces so adding one field
 * never rewrites its neighbors.
 */

const NATIVE_TYPE_TO_PSL: Record<string, { type: string; native?: string }> = {
  uuid: { type: "String", native: "@db.Uuid" },
  text: { type: "String" },
  varchar: { type: "String", native: "@db.VarChar" },
  bool: { type: "Boolean" },
  boolean: { type: "Boolean" },
  int4: { type: "Int" },
  integer: { type: "Int" },
  int8: { type: "BigInt" },
  bigint: { type: "BigInt" },
  float8: { type: "Float" },
  numeric: { type: "Decimal" },
  timestamptz: { type: "DateTime" },
  timestamp: { type: "DateTime" },
  date: { type: "DateTime", native: "@db.Date" },
  jsonb: { type: "Json" },
  json: { type: "Json" },
  bytea: { type: "Bytes" },
};

function pslDefault(defaultValue: string | null): string | null {
  if (defaultValue === null) {
    return null;
  }

  if (defaultValue === "now()") {
    return "@default(now())";
  }

  if (defaultValue === "gen_random_uuid()") {
    return "@default(uuid())";
  }

  if (defaultValue.endsWith("()")) {
    return `@default(dbgenerated("${defaultValue}"))`;
  }

  return `@default(${defaultValue})`;
}

function renderModel(model: SnapshotModel): string[] {
  const lines: string[] = [`model ${model.name} {`];

  for (const field of model.fields) {
    const mapped = field.enumName
      ? { type: field.enumName, native: undefined }
      : (NATIVE_TYPE_TO_PSL[field.type] ?? { type: field.type });
    const attributes: string[] = [];

    if (field.isPrimaryKey) {
      attributes.push("@id");
    }

    const renderedDefault = pslDefault(field.defaultValue);

    if (renderedDefault) {
      attributes.push(renderedDefault);
    }

    if (mapped.native) {
      attributes.push(mapped.native);
    }

    if (field.column && field.column !== field.name) {
      attributes.push(`@map("${field.column}")`);
    }

    const type = `${mapped.type}${field.nullable ? "?" : ""}`;
    const suffix = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";

    lines.push(`  ${field.name} ${type}${suffix}`);
  }

  if (model.relations.length > 0) {
    lines.push("");

    for (const relation of model.relations) {
      const isList =
        relation.cardinality === "1:N" || relation.cardinality === "N:M";
      const type = isList ? `${relation.toModel}[]` : relation.toModel;

      lines.push(`  ${relation.name} ${type}`);
    }
  }

  const blockAttributes: string[] = [];

  for (const index of model.indexes) {
    const match = /^(index|unique)\((.+)\)$/.exec(index);

    if (!match) {
      continue;
    }

    const attribute = match[1] === "unique" ? "@@unique" : "@@index";
    const columns = (match[2] ?? "")
      .split(",")
      .map((column) => column.trim())
      .filter((column) => column.length > 0);

    blockAttributes.push(`${attribute}([${columns.join(", ")}])`);
  }

  if (model.table && model.table !== model.name) {
    blockAttributes.push(`@@map("${model.table}")`);
  }

  if (blockAttributes.length > 0) {
    lines.push("");

    for (const attribute of blockAttributes) {
      lines.push(`  ${attribute}`);
    }
  }

  lines.push("}");

  return lines;
}

export function renderPslSchema(snapshot: ContractSnapshot): string {
  const blocks: string[] = [];
  const enumNames = [...snapshot.enums.keys()].sort();

  for (const enumName of enumNames) {
    const enumValue = snapshot.enums.get(enumName);

    if (!enumValue) {
      continue;
    }

    blocks.push(
      [
        `enum ${enumName} {`,
        ...enumValue.members.map((member) => `  ${member}`),
        "}",
      ].join("\n"),
    );
  }

  const modelNames = [...snapshot.models.keys()].sort();

  for (const modelName of modelNames) {
    const model = snapshot.models.get(modelName);

    if (!model) {
      continue;
    }

    blocks.push(renderModel(model).join("\n"));
  }

  return blocks.join("\n\n");
}

export type SchemaDiffLineKind = "added" | "removed" | "context" | "collapsed";

export interface SchemaDiffLine {
  kind: SchemaDiffLineKind;
  text: string;
  /** Number of hidden lines when `kind` is "collapsed". */
  hiddenCount?: number;
  /**
   * The collapsed run's actual lines when `kind` is "collapsed", so the
   * view can expand a fold in place without re-diffing.
   */
  hiddenLines?: string[];
}

const CONTEXT_LINES = 2;

/**
 * Produces a unified line diff of two schema texts, collapsing long
 * unchanged runs down to `CONTEXT_LINES` around each change.
 */
export function diffSchemas(before: string, after: string): SchemaDiffLine[] {
  const parts = diffLines(before, after);
  const lines: SchemaDiffLine[] = [];

  const pushAll = (kind: "added" | "removed", value: string) => {
    for (const text of splitLines(value)) {
      lines.push({ kind, text });
    }
  };

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (!part) {
      continue;
    }

    if (part.added) {
      pushAll("added", part.value);
      continue;
    }

    if (part.removed) {
      pushAll("removed", part.value);
      continue;
    }

    const contextLines = splitLines(part.value);
    const isFirst = index === 0;
    const isLast = index === parts.length - 1;
    const leadingKeep = isFirst ? 0 : CONTEXT_LINES;
    const trailingKeep = isLast ? 0 : CONTEXT_LINES;

    if (contextLines.length <= leadingKeep + trailingKeep + 1) {
      for (const text of contextLines) {
        lines.push({ kind: "context", text });
      }
      continue;
    }

    for (const text of contextLines.slice(0, leadingKeep)) {
      lines.push({ kind: "context", text });
    }

    const hiddenCount = contextLines.length - leadingKeep - trailingKeep;

    lines.push({
      kind: "collapsed",
      text: "",
      hiddenCount,
      hiddenLines: contextLines.slice(leadingKeep, leadingKeep + hiddenCount),
    });

    if (trailingKeep > 0) {
      for (const text of contextLines.slice(-trailingKeep)) {
        lines.push({ kind: "context", text });
      }
    }
  }

  return lines;
}

export function schemaDiffHasChanges(lines: SchemaDiffLine[]): boolean {
  return lines.some((line) => line.kind === "added" || line.kind === "removed");
}

function splitLines(value: string): string[] {
  const lines = value.split("\n");

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}
