import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { Badge } from "@/ui/components/ui/badge";
import { Input } from "@/ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/ui/toggle-group";
import { useUiState } from "@/ui/hooks/use-ui-state";
import { cn } from "@/ui/lib/utils";

import { StudioHeader } from "../../StudioHeader";
import type { ViewProps } from "../View";

type RequestStatus = "error" | "ok" | "warning";
type RequestSpanKind = "external" | "framework" | "prisma" | "request";
type RequestDetailView = "logs" | "trace";

interface RequestSpan {
  depth: number;
  durationMs: number;
  id: string;
  kind: RequestSpanKind;
  name: string;
  service: string;
  startMs: number;
  status: RequestStatus;
}

interface RequestLogLine {
  id: string;
  level: "debug" | "error" | "info" | "warn";
  message: string | Record<string, unknown>;
  service: string;
  timestamp: string;
}

interface RequestEntry {
  durationMs: number;
  id: string;
  logs: RequestLogLine[];
  message: string;
  method: string;
  path: string;
  service: string;
  spans: RequestSpan[];
  status: number;
  timestamp: string;
  traceId: string;
}

const structuredIdentityLog: Record<string, unknown> = {
  timestamp: "2026-04-25T03:04:47.877Z",
  level: "info",
  service: "identity",
  environment: "staging",
  version: "compute-demo-v1",
  region: "cdg",
  requestId: "demo-app-req-00000999",
  traceId: "demo-app-trace-000249",
  spanId: "identity-span-00000999",
  method: "PATCH",
  path: "/api/invoices",
  status: 200,
  duration: 121,
  message: "Request completed",
  why: null,
  fix: null,
  link: null,
  sampling: {
    kept: true,
    source: "compute-demo-generate",
  },
  redaction: {
    keys: [],
  },
  context: {
    actor: {
      id: "user-00999",
      plan: "pro",
    },
    fingerprint:
      "f7e2e36ec27723a51b69844018c94d51522f79d5edb3f39558e95351437f49637cc1282947c6128ec8fbf5523842d6772364f943a99f48ee6aefbc21ae3170addc2a268df6379d8e31837352d9cbfe6819b01bed196797e3931689906a8e2dd8",
    request: {
      bytes: 1511,
      routeGroup: "invoices",
      traceToken: "f7e2e36ec27723a51b69844018c94d51522f79d5edb3f395",
    },
    traceContext: {
      traceId: "demo-app-trace-000249",
      spanId: "identity-span-00000999",
    },
    tenant: "tenant-15",
    host: "identity-cdg-3",
    releaseChannel: "preview",
  },
};

const demoRequests: RequestEntry[] = [
  {
    durationMs: 121,
    id: "demo-app-req-00000999",
    logs: [
      {
        id: "demo-app-req-00000999-log-1",
        level: "info",
        message: "PATCH /api/invoices accepted by edge runtime",
        service: "gateway",
        timestamp: "2026-04-25T03:04:47.756Z",
      },
      {
        id: "demo-app-req-00000999-log-2",
        level: "debug",
        message: "Loaded tenant policy for tenant-15",
        service: "identity",
        timestamp: "2026-04-25T03:04:47.781Z",
      },
      {
        id: "demo-app-req-00000999-log-3",
        level: "info",
        message: "Updated invoice status with Prisma Client",
        service: "billing",
        timestamp: "2026-04-25T03:04:47.839Z",
      },
      {
        id: "demo-app-req-00000999-log-4",
        level: "info",
        message: structuredIdentityLog,
        service: "identity",
        timestamp: "2026-04-25T03:04:47.877Z",
      },
    ],
    message: "Request completed",
    method: "PATCH",
    path: "/api/invoices",
    service: "identity",
    spans: [
      {
        depth: 0,
        durationMs: 121,
        id: "identity-root",
        kind: "request",
        name: "PATCH /api/invoices",
        service: "identity",
        startMs: 0,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 22,
        id: "identity-policy",
        kind: "framework",
        name: "Load tenant policy",
        service: "identity",
        startMs: 8,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 42,
        id: "identity-prisma-operation",
        kind: "prisma",
        name: "prisma:client:operation Invoice.update",
        service: "billing",
        startMs: 34,
        status: "ok",
      },
      {
        depth: 2,
        durationMs: 5,
        id: "identity-prisma-serialize",
        kind: "prisma",
        name: "prisma:client:serialize",
        service: "billing",
        startMs: 36,
        status: "ok",
      },
      {
        depth: 2,
        durationMs: 31,
        id: "identity-prisma-query",
        kind: "prisma",
        name: "prisma:engine:query",
        service: "billing",
        startMs: 42,
        status: "ok",
      },
      {
        depth: 3,
        durationMs: 18,
        id: "identity-prisma-db-query",
        kind: "prisma",
        name: "prisma:engine:db_query",
        service: "postgres",
        startMs: 48,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 29,
        id: "identity-stripe",
        kind: "external",
        name: "POST https://api.stripe.com/v1/invoices",
        service: "stripe",
        startMs: 78,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 9,
        id: "identity-audit",
        kind: "external",
        name: "POST https://audit.internal/events",
        service: "audit",
        startMs: 108,
        status: "ok",
      },
    ],
    status: 200,
    timestamp: "2026-04-25T03:04:47.877Z",
    traceId: "demo-app-trace-000249",
  },
  {
    durationMs: 684,
    id: "demo-app-req-00000998",
    logs: [
      {
        id: "demo-app-req-00000998-log-1",
        level: "info",
        message: "POST /api/checkout started",
        service: "checkout",
        timestamp: "2026-04-25T03:03:10.032Z",
      },
      {
        id: "demo-app-req-00000998-log-2",
        level: "warn",
        message: "Payment provider retry budget exhausted",
        service: "payments",
        timestamp: "2026-04-25T03:03:10.598Z",
      },
      {
        id: "demo-app-req-00000998-log-3",
        level: "error",
        message: {
          error: "ProviderTimeout",
          fix: "Retry checkout after provider latency recovers",
          link: "https://status.stripe.com/",
          path: "/api/checkout",
          requestId: "demo-app-req-00000998",
          status: 502,
          why: "stripe charge confirmation exceeded 500ms budget",
        },
        service: "checkout",
        timestamp: "2026-04-25T03:03:10.716Z",
      },
    ],
    message: "Payment provider timeout",
    method: "POST",
    path: "/api/checkout",
    service: "checkout",
    spans: [
      {
        depth: 0,
        durationMs: 684,
        id: "checkout-root",
        kind: "request",
        name: "POST /api/checkout",
        service: "checkout",
        startMs: 0,
        status: "error",
      },
      {
        depth: 1,
        durationMs: 74,
        id: "checkout-prisma-operation",
        kind: "prisma",
        name: "prisma:client:operation Cart.findUnique",
        service: "checkout",
        startMs: 18,
        status: "ok",
      },
      {
        depth: 2,
        durationMs: 49,
        id: "checkout-prisma-db-query",
        kind: "prisma",
        name: "prisma:engine:db_query",
        service: "postgres",
        startMs: 35,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 501,
        id: "checkout-stripe",
        kind: "external",
        name: "POST https://api.stripe.com/v1/payment_intents",
        service: "stripe",
        startMs: 111,
        status: "error",
      },
      {
        depth: 1,
        durationMs: 38,
        id: "checkout-feature",
        kind: "external",
        name: "GET https://feature-flags.internal/evaluate",
        service: "flags",
        startMs: 625,
        status: "ok",
      },
    ],
    status: 502,
    timestamp: "2026-04-25T03:03:10.716Z",
    traceId: "demo-app-trace-000248",
  },
  {
    durationMs: 78,
    id: "demo-app-req-00000997",
    logs: [
      {
        id: "demo-app-req-00000997-log-1",
        level: "info",
        message: "Accounts list requested",
        service: "api",
        timestamp: "2026-04-25T03:01:58.124Z",
      },
      {
        id: "demo-app-req-00000997-log-2",
        level: "debug",
        message: "Applied status=active filter",
        service: "api",
        timestamp: "2026-04-25T03:01:58.155Z",
      },
      {
        id: "demo-app-req-00000997-log-3",
        level: "info",
        message: "Request completed",
        service: "api",
        timestamp: "2026-04-25T03:01:58.202Z",
      },
    ],
    message: "Fetched active accounts",
    method: "GET",
    path: "/api/accounts?status=active",
    service: "api",
    spans: [
      {
        depth: 0,
        durationMs: 78,
        id: "accounts-root",
        kind: "request",
        name: "GET /api/accounts",
        service: "api",
        startMs: 0,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 46,
        id: "accounts-prisma-operation",
        kind: "prisma",
        name: "prisma:client:operation Account.findMany",
        service: "api",
        startMs: 15,
        status: "ok",
      },
      {
        depth: 2,
        durationMs: 30,
        id: "accounts-prisma-db-query",
        kind: "prisma",
        name: "prisma:engine:db_query",
        service: "postgres",
        startMs: 26,
        status: "ok",
      },
    ],
    status: 200,
    timestamp: "2026-04-25T03:01:58.202Z",
    traceId: "demo-app-trace-000247",
  },
  {
    durationMs: 246,
    id: "demo-app-req-00000996",
    logs: [
      {
        id: "demo-app-req-00000996-log-1",
        level: "info",
        message: "Dashboard route started",
        service: "web",
        timestamp: "2026-04-25T03:00:19.111Z",
      },
      {
        id: "demo-app-req-00000996-log-2",
        level: "info",
        message: "Rendered dashboard shell",
        service: "web",
        timestamp: "2026-04-25T03:00:19.357Z",
      },
    ],
    message: "Rendered dashboard",
    method: "GET",
    path: "/dashboard",
    service: "web",
    spans: [
      {
        depth: 0,
        durationMs: 246,
        id: "dashboard-root",
        kind: "request",
        name: "GET /dashboard",
        service: "web",
        startMs: 0,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 63,
        id: "dashboard-user",
        kind: "external",
        name: "GET https://identity.internal/session",
        service: "identity",
        startMs: 18,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 58,
        id: "dashboard-prisma-operation",
        kind: "prisma",
        name: "prisma:client:operation DashboardMetric.findMany",
        service: "web",
        startMs: 90,
        status: "ok",
      },
      {
        depth: 2,
        durationMs: 41,
        id: "dashboard-prisma-db-query",
        kind: "prisma",
        name: "prisma:engine:db_query",
        service: "postgres",
        startMs: 103,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 72,
        id: "dashboard-render",
        kind: "framework",
        name: "Render React server components",
        service: "web",
        startMs: 158,
        status: "ok",
      },
    ],
    status: 200,
    timestamp: "2026-04-25T03:00:19.357Z",
    traceId: "demo-app-trace-000246",
  },
  {
    durationMs: 932,
    id: "demo-app-req-00000995",
    logs: [
      {
        id: "demo-app-req-00000995-log-1",
        level: "info",
        message: "Reconciliation enqueue requested",
        service: "jobs",
        timestamp: "2026-04-25T02:58:33.419Z",
      },
      {
        id: "demo-app-req-00000995-log-2",
        level: "warn",
        message: "Queue handoff was slow but accepted",
        service: "jobs",
        timestamp: "2026-04-25T02:58:34.351Z",
      },
    ],
    message: "Queued reconciliation job",
    method: "POST",
    path: "/api/reconcile",
    service: "jobs",
    spans: [
      {
        depth: 0,
        durationMs: 932,
        id: "reconcile-root",
        kind: "request",
        name: "POST /api/reconcile",
        service: "jobs",
        startMs: 0,
        status: "warning",
      },
      {
        depth: 1,
        durationMs: 115,
        id: "reconcile-prisma-operation",
        kind: "prisma",
        name: "prisma:client:operation ReconciliationRun.create",
        service: "jobs",
        startMs: 24,
        status: "ok",
      },
      {
        depth: 2,
        durationMs: 87,
        id: "reconcile-prisma-db-query",
        kind: "prisma",
        name: "prisma:engine:db_query",
        service: "postgres",
        startMs: 43,
        status: "ok",
      },
      {
        depth: 1,
        durationMs: 702,
        id: "reconcile-queue",
        kind: "external",
        name: "POST https://queue.internal/reconciliation",
        service: "queue",
        startMs: 157,
        status: "warning",
      },
    ],
    status: 202,
    timestamp: "2026-04-25T02:58:34.351Z",
    traceId: "demo-app-trace-000245",
  },
];

demoRequests.sort(
  (left, right) =>
    new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
);

export function RequestsView(_props: ViewProps) {
  const [expandedRequestId, setExpandedRequestId] = useUiState<string | null>(
    "requests:expanded-request",
    null,
  );
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRequests = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return demoRequests;
    }

    return demoRequests.filter((request) =>
      [
        request.id,
        request.traceId,
        request.service,
        request.method,
        request.path,
        request.message,
        String(request.status),
        formatDuration(request.durationMs),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  function toggleExpandedRequest(requestId: string) {
    setExpandedRequestId((current) =>
      current === requestId ? null : requestId,
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <StudioHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-3 bg-background/50 p-4">
        <div className="flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-sm font-medium">Requests</h1>
            <p className="text-xs text-muted-foreground">
              {visibleRequests.length} of {demoRequests.length} dummy requests
            </p>
          </div>
          <div className="relative w-full max-w-xl">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={14}
            />
            <Input
              aria-label="Filter requests"
              className="pl-8"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Filter by service, path, message, trace ID..."
              value={query}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-background">
          <Table
            className="min-w-[920px] table-fixed"
            containerProps={{ className: "h-full overflow-auto" }}
          >
            <TableHeader className="sticky top-0 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[11rem] px-3">Timestamp</TableHead>
                <TableHead className="w-[10rem] px-3">Service</TableHead>
                <TableHead className="w-[18rem] px-3">Path</TableHead>
                <TableHead className="px-3">Message</TableHead>
                <TableHead className="w-[8rem] px-3 text-right">
                  Duration
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRequests.map((request) => {
                const isExpanded = request.id === expandedRequestId;

                return (
                  <Fragment key={request.id}>
                    <TableRow
                      aria-expanded={isExpanded}
                      className="cursor-pointer data-[expanded=true]:bg-muted/40"
                      data-expanded={isExpanded ? "true" : "false"}
                      data-testid={`request-row-${request.id}`}
                      onClick={() => toggleExpandedRequest(request.id)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }

                        event.preventDefault();
                        toggleExpandedRequest(request.id);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <TableCell className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        <span className="whitespace-nowrap">
                          {formatTimestamp(request.timestamp)}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <span className="font-mono text-xs">
                          {request.service}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {request.method}
                          </Badge>
                          <span className="truncate font-mono text-xs">
                            {request.path}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown
                              aria-hidden="true"
                              className="shrink-0 text-muted-foreground"
                              size={14}
                            />
                          ) : (
                            <ChevronRight
                              aria-hidden="true"
                              className="shrink-0 text-muted-foreground"
                              size={14}
                            />
                          )}
                          <Badge
                            variant={getStatusBadgeVariant(request.status)}
                            className="font-mono"
                          >
                            {request.status}
                          </Badge>
                          <span className="truncate text-sm">
                            {request.message}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-xs">
                        {formatDuration(request.durationMs)}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={5} className="p-0">
                          <RequestDetails request={request} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function RequestDetails({ request }: { request: RequestEntry }) {
  const [detailView, setDetailView] = useUiState<RequestDetailView>(
    `requests:${request.id}:detail-view`,
    "trace",
  );

  return (
    <div className="flex flex-col gap-3 border-b px-3 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            {request.id}
          </Badge>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {request.traceId}
          </span>
        </div>
        <ToggleGroup
          aria-label="Request detail view"
          onValueChange={(value) => {
            if (value === "trace" || value === "logs") {
              setDetailView(value);
            }
          }}
          size="sm"
          type="single"
          value={detailView}
          variant="outline"
        >
          <ToggleGroupItem
            aria-label="Show trace"
            data-testid="request-detail-trace-trigger"
            value="trace"
          >
            Trace
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Show logs"
            data-testid="request-detail-logs-trigger"
            value="logs"
          >
            Logs
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {detailView === "trace" ? (
        <RequestTraceView request={request} />
      ) : (
        <RequestLogsView request={request} />
      )}
    </div>
  );
}

function RequestTraceView({ request }: { request: RequestEntry }) {
  const totalDuration = Math.max(
    request.durationMs,
    ...request.spans.map((span) => span.startMs + span.durationMs),
  );

  return (
    <div className="max-w-full overflow-hidden rounded-md border bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Trace timeline</h2>
          <p className="text-xs text-muted-foreground">
            External calls and Prisma OpenTelemetry spans for this request
          </p>
        </div>
        <Badge variant="outline" className="font-mono">
          {formatDuration(totalDuration)}
        </Badge>
      </div>
      <div className="grid grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] border-b text-xs text-muted-foreground">
        <div className="px-3 py-2">Span</div>
        <div className="grid grid-cols-5 border-l">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <div key={tick} className="border-l px-2 py-2 first:border-l-0">
              {formatDuration(Math.round(totalDuration * tick))}
            </div>
          ))}
        </div>
      </div>
      <div>
        {request.spans.map((span) => {
          const left = percentage(span.startMs, totalDuration);
          const width = Math.max(percentage(span.durationMs, totalDuration), 2);

          return (
            <div
              key={span.id}
              className="grid min-h-10 grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] border-b last:border-b-0"
            >
              <div
                className="flex min-w-0 items-center gap-2 px-3 py-2"
                style={{ paddingLeft: `${12 + span.depth * 16}px` }}
              >
                <Badge variant="secondary" className="font-mono">
                  {formatSpanKind(span.kind)}
                </Badge>
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">{span.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {span.service}
                  </div>
                </div>
              </div>
              <div className="relative min-h-10 border-l bg-muted/20">
                <div
                  className={cn(
                    "absolute top-1/2 box-border flex h-6 -translate-y-1/2 items-center rounded-sm border px-2 text-xs shadow-xs",
                    getSpanBarClasses(span),
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${span.name}: ${formatDuration(span.durationMs)}`}
                >
                  <span className="truncate font-mono">
                    {formatDuration(span.durationMs)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RequestLogsView({ request }: { request: RequestEntry }) {
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-medium">Associated logs</h2>
          <p className="text-xs text-muted-foreground">
            Log lines carrying request ID {request.id}
          </p>
        </div>
        <Badge variant="outline" className="font-mono">
          {request.logs.length} lines
        </Badge>
      </div>
      <div className="divide-y">
        {request.logs.map((log) => (
          <div key={log.id} className="px-3 py-2">
            <div className="grid grid-cols-[10rem_5rem_8rem_1fr] gap-3 text-xs">
              <span className="font-mono text-muted-foreground">
                {formatTimestamp(log.timestamp)}
              </span>
              <Badge
                variant={getLogLevelBadgeVariant(log.level)}
                className="w-fit font-mono"
              >
                {log.level}
              </Badge>
              <span className="truncate font-mono">{log.service}</span>
              <span className="min-w-0 truncate font-mono">
                {getLogMessageSummary(log)}
              </span>
            </div>
            {typeof log.message !== "string" && (
              <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5 text-foreground">
                {JSON.stringify(log.message, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  const month = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = pad(date.getUTCDate(), 2);
  const hours = pad(date.getUTCHours(), 2);
  const minutes = pad(date.getUTCMinutes(), 2);
  const seconds = pad(date.getUTCSeconds(), 2);
  const milliseconds = pad(date.getUTCMilliseconds(), 3);

  return `${month} ${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function formatDuration(durationMs: number) {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(2)}s`;
  }

  return `${Math.round(durationMs)}ms`;
}

function formatSpanKind(kind: RequestSpanKind) {
  switch (kind) {
    case "external":
      return "fetch";
    case "framework":
      return "app";
    case "prisma":
      return "prisma";
    case "request":
      return "root";
  }
}

function getLogMessageSummary(log: RequestLogLine) {
  if (typeof log.message === "string") {
    return log.message;
  }

  const message = log.message.message;

  return typeof message === "string" ? message : "Structured log";
}

function getStatusBadgeVariant(status: number) {
  if (status >= 500) {
    return "destructive";
  }

  if (status >= 400) {
    return "secondary";
  }

  return "success";
}

function getLogLevelBadgeVariant(level: RequestLogLine["level"]) {
  switch (level) {
    case "error":
      return "destructive";
    case "warn":
      return "secondary";
    case "debug":
    case "info":
      return "outline";
  }
}

function getSpanBarClasses(span: RequestSpan) {
  if (span.status === "error") {
    return "bg-destructive/20 text-foreground";
  }

  if (span.status === "warning") {
    return "bg-secondary text-secondary-foreground";
  }

  switch (span.kind) {
    case "external":
      return "bg-primary/15 text-foreground";
    case "framework":
      return "bg-accent text-accent-foreground";
    case "prisma":
      return "bg-muted text-foreground";
    case "request":
      return "bg-background text-foreground";
  }
}

function percentage(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return (value / total) * 100;
}

function pad(value: number, length: number) {
  return value.toString().padStart(length, "0");
}
