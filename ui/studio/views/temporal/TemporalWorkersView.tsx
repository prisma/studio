import { RefreshCw } from "lucide-react";

import type { TemporalFollowMode } from "@/data/temporal";
import { Button } from "@/ui/components/ui/button";
import { Skeleton } from "@/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/ui/table";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useTemporalWorkers } from "@/ui/hooks/use-temporal";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import {
  TemporalFollowControl,
  temporalIconScale,
  TemporalNamespaceBadge,
  TemporalSectionLabel,
  temporalTableHeadClass,
  TemporalTime,
} from "./TemporalPrimitives";
import { quoteFilterValue } from "./TemporalRunBreadcrumb";

/**
 * Workers, Worker Deployments and Nexus Endpoints. A list the server does not
 * offer is replaced by one line that says so.
 */
export function TemporalWorkersView(props: {
  followMode: TemporalFollowMode;
  namespace: string;
  onFollowModeChange: (mode: TemporalFollowMode) => void;
}) {
  const { followMode, namespace, onFollowModeChange } = props;
  const { createUrl } = useNavigation();
  const { data, error, isError, isFetching, isLoading, refetch } =
    useTemporalWorkers({ followMode, namespace });
  const queueUrl = (queueName: string) =>
    createUrl({
      searchParam: `TaskQueue = ${quoteFilterValue(queueName)}`,
      temporalNsParam: namespace,
      temporalSectionParam: "workflows",
      viewParam: "temporal",
    });

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        temporalIconScale,
      )}
      data-testid="temporal-workers-view"
    >
      <StudioHeader
        title="Workers"
        endContent={
          <>
            <TemporalFollowControl
              value={followMode}
              onChange={onFollowModeChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-8 px-0"
              aria-label="Refresh"
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn(isFetching && "motion-safe:animate-spin")}
              />
            </Button>
          </>
        }
      >
        <TemporalNamespaceBadge namespace={namespace} />
      </StudioHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
            <p className="font-medium text-destructive">
              {error instanceof Error
                ? error.message
                : "Could not load workers"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex flex-col">
            <WorkersSection
              emptyText="No Worker polls a Task Queue of this namespace."
              headers={["Identity", "Task Queues", "Last Poll"]}
              rows={data.workers?.map((worker) => ({
                cells: [
                  <span key="id" className="font-mono text-foreground">
                    {worker.identity}
                  </span>,
                  <span key="queues" className="flex flex-wrap gap-1.5">
                    {worker.taskQueues.map((queue) => (
                      <a
                        key={`${queue.name}:${queue.type}`}
                        href={queueUrl(queue.name)}
                        className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-2xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {queue.name} · {queue.type}
                      </a>
                    ))}
                  </span>,
                  <TemporalTime key="time" iso={worker.lastAccessTime} />,
                ],
                key: worker.identity,
              }))}
              title="Workers"
              unsupportedText="This server does not report which Workers poll a Task Queue."
            />
            <WorkersSection
              emptyText="No Worker Deployment. A Worker that sets a deployment name and build ID appears here."
              headers={["Deployment", "Current Version", "Ramping", "Created"]}
              rows={data.deployments?.map((deployment) => ({
                cells: [
                  <span key="name" className="font-mono text-foreground">
                    {deployment.name}
                  </span>,
                  <span key="current" className="font-mono">
                    {deployment.currentVersion ?? "—"}
                  </span>,
                  <span key="ramping" className="font-mono">
                    {deployment.rampingVersion
                      ? `${deployment.rampingVersion} (${deployment.rampingPercentage ?? 0}%)`
                      : "—"}
                  </span>,
                  <TemporalTime key="time" iso={deployment.createTime} />,
                ],
                key: deployment.name,
              }))}
              title="Worker Deployments"
              unsupportedText="This server does not support Worker Deployments."
            />
            <WorkersSection
              emptyText="No Nexus Endpoint is registered on this server."
              headers={["Endpoint", "Target", "Description", "Created"]}
              rows={data.nexusEndpoints?.map((endpoint) => ({
                cells: [
                  <span key="name" className="font-mono text-foreground">
                    {endpoint.name}
                  </span>,
                  <span key="target" className="font-mono">
                    {endpoint.target}
                  </span>,
                  <span key="description">{endpoint.description ?? "—"}</span>,
                  <TemporalTime key="time" iso={endpoint.createdTime} />,
                ],
                key: endpoint.id,
              }))}
              title="Nexus Endpoints"
              unsupportedText="This server does not support Nexus."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function WorkersSection(props: {
  emptyText: string;
  headers: string[];
  /** Undefined or null when the server does not offer this list. */
  rows: Array<{ cells: React.ReactNode[]; key: string }> | null | undefined;
  title: string;
  unsupportedText: string;
}) {
  const { emptyText, headers, rows, title, unsupportedText } = props;

  return (
    <section
      className="border-b border-border"
      data-testid={`temporal-workers-${title.toLowerCase().replaceAll(" ", "-")}`}
    >
      <div className="flex items-center gap-2 bg-muted/20 px-4 py-2.5">
        <TemporalSectionLabel className="text-foreground">
          {title}
        </TemporalSectionLabel>
        {rows ? (
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {rows.length}
          </span>
        ) : null}
      </div>
      {!rows || rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          {rows ? emptyText : unsupportedText}
        </p>
      ) : (
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="border-border/70 hover:bg-transparent">
              {headers.map((header, index) => (
                <TableHead
                  key={header}
                  className={cn(temporalTableHeadClass, index === 0 && "pl-4")}
                >
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.key}
                className="border-border/60 hover:bg-muted/30"
              >
                {row.cells.map((cell, index) => (
                  <TableCell
                    key={index}
                    className={cn(
                      "px-2 py-2 text-muted-foreground",
                      index === 0 && "pl-4",
                    )}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
