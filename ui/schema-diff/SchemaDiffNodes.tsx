import { ArrowRight, Key } from "lucide-react";
import { type FC, memo } from "react";
import { Handle, type NodeProps, type NodeTypes, Position } from "reactflow";

import { cn } from "../lib/utils";
import type { DiffStatus, FieldDiff } from "./contract-diff";
import type { EnumDiffNodeData, ModelDiffNodeData } from "./diff-layout";

const STATUS_STYLES: Record<
  DiffStatus,
  {
    card: string;
    header: string;
    badge: string;
    badgeLabel: string;
    tape: string;
  }
> = {
  added: {
    card: "border-emerald-400/80 bg-emerald-50 dark:border-emerald-600/70 dark:bg-emerald-950/60",
    header: "text-emerald-900 dark:text-emerald-100",
    badge:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    badgeLabel: "new",
    tape: "bg-emerald-300/70 dark:bg-emerald-700/70",
  },
  removed: {
    card: "border-rose-400/80 bg-rose-50 dark:border-rose-600/70 dark:bg-rose-950/60",
    header: "text-rose-900 line-through decoration-2 dark:text-rose-100",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    badgeLabel: "removed",
    tape: "bg-rose-300/70 dark:bg-rose-700/70",
  },
  changed: {
    card: "border-amber-400/80 bg-amber-50 dark:border-amber-600/70 dark:bg-amber-950/50",
    header: "text-amber-900 dark:text-amber-100",
    badge:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    badgeLabel: "updated",
    tape: "bg-amber-300/70 dark:bg-amber-700/70",
  },
  unchanged: {
    card: "border-border bg-card opacity-70",
    header: "text-foreground",
    badge: "bg-muted text-muted-foreground border-border",
    badgeLabel: "unchanged",
    tape: "bg-muted-foreground/20",
  },
};

const FIELD_STATUS_GLYPHS: Record<
  DiffStatus,
  { glyph: string; className: string }
> = {
  added: {
    glyph: "+",
    className:
      "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold",
  },
  removed: {
    glyph: "−",
    className: "bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold",
  },
  changed: {
    glyph: "~",
    className: "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold",
  },
  unchanged: {
    glyph: "·",
    className: "text-muted-foreground/60",
  },
};

/** Deterministic sticky-note tilt so the canvas feels hand-placed. */
function cardRotation(seed: string): number {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  const tilts = [-1.4, -0.7, 0, 0.7, 1.4];

  return tilts[Math.abs(hash) % tilts.length] ?? 0;
}

const FieldRow: FC<{ field: FieldDiff }> = ({ field }) => {
  const glyph = FIELD_STATUS_GLYPHS[field.status];

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs",
          field.status === "removed" && "line-through opacity-70",
        )}
      >
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] leading-none",
            glyph.className,
          )}
        >
          {glyph.glyph}
        </span>
        {field.field.isPrimaryKey && (
          <Key className="size-3 shrink-0 text-primary" />
        )}
        <span className="min-w-0 truncate font-medium text-foreground">
          {field.name}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          {field.field.type}
          {field.field.nullable ? "?" : ""}
        </span>
      </div>
      {field.details.map((detail) => (
        <div
          key={detail.aspect}
          className="ml-6 flex items-center gap-1 pb-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
        >
          <span className="rounded bg-rose-500/10 px-1 text-rose-700 line-through dark:text-rose-300">
            {detail.before}
          </span>
          <ArrowRight className="size-2.5 shrink-0" />
          <span className="rounded bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-300">
            {detail.after}
          </span>
        </div>
      ))}
    </div>
  );
};

const ModelDiffNodeComponent: FC<NodeProps<ModelDiffNodeData>> = memo(
  ({ data }) => {
    const { model } = data;
    const styles = STATUS_STYLES[model.status];
    const rotation = cardRotation(model.name);
    const structureChips = [
      ...model.addedIndexes.map((index) => ({
        key: `+${index}`,
        label: `+ ${index}`,
        className:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      })),
      ...model.removedIndexes.map((index) => ({
        key: `-${index}`,
        label: `− ${index}`,
        className:
          "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 line-through",
      })),
    ];

    return (
      <div
        className={cn(
          "relative w-[264px] rounded-xl border-2 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.35)]",
          styles.card,
        )}
        data-testid={`migration-model-node-${model.name}`}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <div
          className={cn(
            "absolute -top-2.5 left-1/2 h-4 w-14 -translate-x-1/2 -rotate-2 rounded-sm opacity-90",
            styles.tape,
          )}
        />
        <div className="flex items-center justify-between gap-2 border-b border-current/10 px-3 pb-2 pt-3">
          <div className="min-w-0">
            <div className={cn("truncate text-sm font-bold", styles.header)}>
              {model.name}
            </div>
            {model.table && model.table !== model.name && (
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {model.table}
              </div>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              styles.badge,
            )}
          >
            {styles.badgeLabel}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
          {model.fields.map((field) => (
            <FieldRow key={field.name} field={field} />
          ))}
        </div>
        {structureChips.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-current/10 px-2 py-1.5">
            {structureChips.map((chip) => (
              <span
                key={chip.key}
                className={cn(
                  "rounded-full border px-1.5 py-px font-mono text-[9px]",
                  chip.className,
                )}
              >
                {chip.label}
              </span>
            ))}
          </div>
        )}
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0 }}
        />
      </div>
    );
  },
);

ModelDiffNodeComponent.displayName = "ModelDiffNodeComponent";

const EnumDiffNodeComponent: FC<NodeProps<EnumDiffNodeData>> = memo(
  ({ data }) => {
    const { enumDiff } = data;
    const rotation = cardRotation(enumDiff.name);
    const cardStatus =
      enumDiff.status === "unchanged" ? "unchanged" : enumDiff.status;

    return (
      <div
        className={cn(
          "relative w-[190px] rounded-xl border-2 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.35)]",
          cardStatus === "added" &&
            "border-violet-400/80 bg-violet-50 dark:border-violet-600/70 dark:bg-violet-950/60",
          cardStatus === "removed" &&
            "border-rose-400/80 bg-rose-50 dark:border-rose-600/70 dark:bg-rose-950/60",
          cardStatus === "changed" &&
            "border-violet-400/80 bg-violet-50 dark:border-violet-600/70 dark:bg-violet-950/60",
          cardStatus === "unchanged" && "border-border bg-card opacity-70",
        )}
        data-testid={`migration-enum-node-${enumDiff.name}`}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <div
          className={cn(
            "absolute -top-2.5 left-1/2 h-4 w-12 -translate-x-1/2 rotate-2 rounded-sm opacity-90",
            "bg-violet-300/70 dark:bg-violet-700/70",
          )}
        />
        <div className="flex items-center justify-between gap-2 border-b border-current/10 px-3 pb-2 pt-3">
          <span
            className={cn(
              "truncate text-sm font-bold text-violet-900 dark:text-violet-100",
              enumDiff.status === "removed" &&
                "text-rose-900 line-through dark:text-rose-100",
            )}
          >
            {enumDiff.name}
          </span>
          <span className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
            enum
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-2 py-1.5">
          {enumDiff.members.map((member) => {
            const glyph = FIELD_STATUS_GLYPHS[member.status];

            return (
              <div
                key={member.name}
                className={cn(
                  "flex items-center gap-1.5 px-1 text-xs",
                  member.status === "removed" && "line-through opacity-70",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[10px] leading-none",
                    glyph.className,
                  )}
                >
                  {glyph.glyph}
                </span>
                <span className="font-mono text-foreground">{member.name}</span>
              </div>
            );
          })}
        </div>
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0 }}
        />
      </div>
    );
  },
);

EnumDiffNodeComponent.displayName = "EnumDiffNodeComponent";

export const nodeTypes: NodeTypes = {
  modelDiff: ModelDiffNodeComponent,
  enumDiff: EnumDiffNodeComponent,
};
