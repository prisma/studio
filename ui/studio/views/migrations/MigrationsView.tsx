import dayjs from "dayjs";
import { GitBranch, TriangleAlert } from "lucide-react";
import { useMemo } from "react";

import type { StudioMigration } from "../../../../data/migrations";
import { Badge } from "../../../components/ui/badge";
import { Skeleton } from "../../../components/ui/skeleton";
import { useMigrations } from "../../../hooks/use-migrations";
import { useNavigation } from "../../../hooks/use-navigation";
import { useUiState } from "../../../hooks/use-ui-state";
import { cn } from "../../../lib/utils";
import {
  diffContracts,
  summarizeDiff,
} from "../../../schema-diff/contract-diff";
import { SchemaDiff } from "../../../schema-diff/SchemaDiff";
import { StudioHeader } from "../../StudioHeader";
import type { ViewProps } from "../View";

function shortHash(hash: string | null): string {
  if (!hash) {
    return "∅";
  }

  return hash.replace(/^sha256:/, "").slice(0, 7);
}

function MigrationListItem(props: {
  index: number;
  isSelected: boolean;
  migration: StudioMigration;
  onSelect: () => void;
}) {
  const { index, isSelected, migration, onSelect } = props;
  const stats = useMemo(
    () =>
      summarizeDiff(
        diffContracts(migration.contractBefore, migration.contractAfter).stats,
      ),
    [migration.contractBefore, migration.contractAfter],
  );

  return (
    <button
      className={cn(
        "group flex w-full flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left transition-colors",
        "hover:bg-accent/60",
        isSelected && "border-border bg-accent shadow-sm",
      )}
      data-testid={`migration-list-item-${migration.id}`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-5 min-w-7 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          #{index}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize text-foreground">
          {migration.displayName}
        </span>
        {migration.isDestructive && (
          <TriangleAlert className="size-3.5 shrink-0 text-amber-500" />
        )}
      </div>
      <div className="flex items-center gap-2 pl-9">
        <span className="text-[10px] text-muted-foreground">
          {migration.appliedAt
            ? dayjs(migration.appliedAt).format("MMM D, HH:mm:ss")
            : "unknown time"}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {migration.operations.length} op
          {migration.operations.length === 1 ? "" : "s"}
        </span>
      </div>
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-9">
          {stats.slice(0, 3).map((chip) => (
            <span
              key={chip}
              className={cn(
                "rounded-full px-1.5 py-px font-mono text-[9px]",
                chip.startsWith("+") &&
                  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                chip.startsWith("−") &&
                  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                chip.startsWith("~") &&
                  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
              )}
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export function MigrationsView(_props: ViewProps) {
  const { hasPrismaNextMigrations, isLoading, isError, migrations } =
    useMigrations();
  const { migrationParam, setMigrationParam } = useNavigation();
  const [showAllModels, setShowAllModels] = useUiState<boolean>(
    "migrations:show-all-models",
    false,
  );
  const [detailsPanelHeight, setDetailsPanelHeight] = useUiState<number>(
    "migrations:details-panel-height",
    256,
  );
  const selectedMigration = useMemo(() => {
    if (migrationParam) {
      const match = migrations.find(
        (migration) => String(migration.id) === migrationParam,
      );

      if (match) {
        return match;
      }
    }

    return migrations[0] ?? null;
  }, [migrationParam, migrations]);

  const contractDataMissing =
    migrations.length > 0 &&
    migrations.every((migration) => migration.contractAfter == null);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <StudioHeader>
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Migrations</span>
          {migrations.length > 0 && (
            <Badge variant="secondary">{migrations.length}</Badge>
          )}
        </div>
      </StudioHeader>

      {!hasPrismaNextMigrations ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No Prisma Next migration ledger detected in this database.
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 gap-4 p-4">
          <div className="flex w-72 flex-col gap-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
          <Skeleton className="h-full flex-1" />
        </div>
      ) : isError ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Failed to load the migration ledger. Check the database connection and
          retry.
        </div>
      ) : migrations.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          The migration ledger is empty — apply a migration with prisma-next to
          see it here.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside
            className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-card/40 p-2"
            data-testid="migration-list"
          >
            {migrations.map((migration, position) => (
              <MigrationListItem
                key={migration.id}
                index={migrations.length - position}
                isSelected={selectedMigration?.id === migration.id}
                migration={migration}
                onSelect={() => {
                  void setMigrationParam(String(migration.id));
                }}
              />
            ))}
          </aside>

          <main className="relative flex min-w-0 flex-1 flex-col">
            {selectedMigration && (
              <SchemaDiff
                scoped={false}
                before={
                  contractDataMissing ? null : selectedMigration.contractBefore
                }
                after={
                  contractDataMissing ? null : selectedMigration.contractAfter
                }
                title={selectedMigration.displayName}
                fromLabel={shortHash(selectedMigration.fromHash)}
                toLabel={shortHash(selectedMigration.toHash)}
                appliedAt={selectedMigration.appliedAt}
                operations={selectedMigration.operations}
                showAllModels={showAllModels}
                onShowAllModelsChange={setShowAllModels}
                detailsPanelHeight={detailsPanelHeight}
                onDetailsPanelHeightChange={setDetailsPanelHeight}
                missingSnapshotsMessage="Please update to the latest version of Prisma Next to view migrations in Studio"
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
