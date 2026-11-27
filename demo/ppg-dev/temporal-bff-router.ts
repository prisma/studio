import * as grpc from "@grpc/grpc-js";

import type {
  TemporalActivityOperation,
  TemporalAdmissionUpdateInput,
  TemporalBulkActionRequest,
  TemporalBulkJobRequest,
  TemporalBulkScheduleRequest,
  TemporalCreateScheduleInput,
  TemporalPatchScheduleInput,
  TemporalStartWorkflowInput,
} from "../../data/temporal/types";
import {
  isWorkflowSortField,
  type TemporalGrpcBffClient,
} from "./temporal-bff";

export function formatGrpcError(err: unknown): string {
  if (err && typeof err === "object" && "details" in err) {
    const details = (err as { details?: unknown }).details;
    if (typeof details === "string" && details.length > 0) {
      return details;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function grpcStatusToHttp(err: unknown): number {
  if (err && typeof err === "object" && "httpStatus" in err) {
    const status = (err as { httpStatus?: unknown }).httpStatus;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      return status;
    }
  }
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: number }).code;
    if (code === grpc.status.NOT_FOUND) return 404;
    if (code === grpc.status.INVALID_ARGUMENT) return 400;
    if (code === grpc.status.ALREADY_EXISTS) return 409;
    if (code === grpc.status.FAILED_PRECONDITION) return 412;
    if (code === grpc.status.UNIMPLEMENTED) return 501;
    if (code === grpc.status.UNAUTHENTICATED) return 401;
    if (code === grpc.status.PERMISSION_DENIED) return 403;
    if (code === grpc.status.RESOURCE_EXHAUSTED) return 429;
    if (code === grpc.status.DEADLINE_EXCEEDED) return 504;
  }
  return 500;
}

/**
 * Handles HTTP BFF requests under `/api/temporal/*` and translates them to
 * Temporal gRPC `WorkflowService` calls (working identically against both
 * `slate-temporal-next` and standard Temporal servers).
 */
export async function handleTemporalBffRequest(
  client: TemporalGrpcBffClient,
  request: Request,
  subPath: string,
  url: URL,
): Promise<Response> {
  try {
    if (request.method === "GET" && subPath === "/v1/capabilities") {
      return Response.json(await client.getCapabilities());
    }

    if (request.method === "GET" && subPath === "/v1/namespaces") {
      return Response.json({ namespaces: await client.listNamespaces() });
    }

    const nsWorkflowsMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflows$/,
    );
    if (nsWorkflowsMatch) {
      const namespace = decodeURIComponent(nsWorkflowsMatch[1]!);
      if (request.method === "GET") {
        const query = url.searchParams.get("query") ?? "";
        const pageSize = Number.parseInt(
          url.searchParams.get("pageSize") ?? "50",
          10,
        );
        const nextPageToken =
          url.searchParams.get("nextPageToken") ?? undefined;
        const sortField = url.searchParams.get("sort");
        return Response.json(
          await client.listWorkflows({
            includeCounts: url.searchParams.get("counts") !== "0",
            includeList: url.searchParams.get("list") !== "0",
            namespace,
            nextPageToken,
            pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 50,
            query,
            ...(isWorkflowSortField(sortField)
              ? {
                  sort: {
                    direction:
                      url.searchParams.get("dir") === "asc" ? "asc" : "desc",
                    field: sortField,
                  },
                }
              : {}),
          }),
        );
      }

      if (request.method === "POST") {
        const body = (await request.json()) as TemporalStartWorkflowInput;
        return Response.json(await client.startWorkflow(namespace, body), {
          status: 201,
        });
      }
    }

    const bulkMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflows\/bulk$/,
    );
    if (bulkMatch && request.method === "POST") {
      const namespace = decodeURIComponent(bulkMatch[1]!);
      const body = (await request.json()) as TemporalBulkActionRequest;
      return Response.json(await client.bulkAction(namespace, body));
    }

    const bulkJobsMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/bulk-jobs(?:\/([^/]+))?$/,
    );
    if (bulkJobsMatch) {
      const namespace = decodeURIComponent(bulkJobsMatch[1]!);
      const jobId = bulkJobsMatch[2];

      if (!jobId && request.method === "POST") {
        return Response.json(
          await client.startBulkJob(
            namespace,
            (await request.json()) as TemporalBulkJobRequest,
          ),
          { status: 202 },
        );
      }

      if (jobId && request.method === "GET") {
        return Response.json(client.getBulkJob(jobId));
      }

      if (jobId && request.method === "DELETE") {
        return Response.json(client.abortBulkJob(jobId));
      }
    }

    const actionMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflows\/([^/]+)\/(query|signal|update|cancel|terminate|reset-sticky|reset|activity|pause|unpause)$/,
    );
    if (actionMatch && request.method === "POST") {
      const namespace = decodeURIComponent(actionMatch[1]!);
      const workflowId = decodeURIComponent(actionMatch[2]!);
      const action = actionMatch[3]!;
      const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const runId = typeof body.runId === "string" ? body.runId : undefined;

      if (action === "reset") {
        return Response.json(
          await client.resetWorkflow({
            eventId: Number(body.eventId),
            namespace,
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId: runId ?? "",
            workflowId,
          }),
        );
      }

      if (action === "activity") {
        return Response.json(
          await client.activityOperation({
            activityId: String(body.activityId ?? ""),
            namespace,
            operation: body.operation as TemporalActivityOperation,
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId,
            workflowId,
          }),
        );
      }

      if (action === "pause" || action === "unpause") {
        return Response.json(
          await client.setWorkflowPaused({
            namespace,
            paused: action === "pause",
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId,
            workflowId,
          }),
        );
      }

      if (action === "reset-sticky") {
        return Response.json(
          await client.resetStickyTaskQueue({ namespace, runId, workflowId }),
        );
      }

      if (action === "query") {
        return Response.json(
          await client.queryWorkflow({
            args: Array.isArray(body.args) ? body.args : undefined,
            namespace,
            queryType: String(body.queryType ?? ""),
            runId,
            workflowId,
          }),
        );
      }
      if (action === "signal") {
        return Response.json(
          await client.signalWorkflow({
            args: Array.isArray(body.args) ? body.args : undefined,
            namespace,
            runId,
            signalName: String(body.signalName ?? ""),
            workflowId,
          }),
        );
      }
      if (action === "update") {
        return Response.json(
          await client.updateWorkflow({
            args: Array.isArray(body.args) ? body.args : undefined,
            namespace,
            runId,
            updateName: String(body.updateName ?? ""),
            workflowId,
          }),
        );
      }
      if (action === "cancel") {
        return Response.json(
          await client.cancelWorkflow({
            namespace,
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId,
            workflowId,
          }),
        );
      }
      if (action === "terminate") {
        return Response.json(
          await client.terminateWorkflow({
            namespace,
            reason: typeof body.reason === "string" ? body.reason : undefined,
            runId,
            workflowId,
          }),
        );
      }
    }

    const detailMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflows\/([^/]+)$/,
    );
    if (detailMatch && request.method === "GET") {
      const namespace = decodeURIComponent(detailMatch[1]!);
      const workflowId = decodeURIComponent(detailMatch[2]!);
      const runId = url.searchParams.get("runId") ?? undefined;
      return Response.json(
        await client.getWorkflowDetail({ namespace, runId, workflowId }),
      );
    }

    // ---------- Schedules routes ----------
    const nsSchedulesMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/schedules$/,
    );
    if (nsSchedulesMatch) {
      const namespace = decodeURIComponent(nsSchedulesMatch[1]!);
      if (request.method === "GET") {
        const nextPageToken =
          url.searchParams.get("nextPageToken") ?? undefined;
        const pageSizeParam = Number.parseInt(
          url.searchParams.get("pageSize") ?? "",
          10,
        );
        const pageSize =
          Number.isFinite(pageSizeParam) && pageSizeParam > 0
            ? Math.min(pageSizeParam, 200)
            : undefined;
        return Response.json(
          await client.listSchedules(namespace, { nextPageToken, pageSize }),
        );
      }
      if (request.method === "POST") {
        const body = (await request.json()) as TemporalCreateScheduleInput;
        return Response.json(await client.createSchedule(namespace, body), {
          status: 201,
        });
      }
    }

    const bulkSchedulesMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/schedules\/bulk$/,
    );
    if (bulkSchedulesMatch && request.method === "POST") {
      const namespace = decodeURIComponent(bulkSchedulesMatch[1]!);
      const body = (await request.json()) as TemporalBulkScheduleRequest;
      return Response.json(await client.bulkScheduleAction(namespace, body));
    }

    const schedPatchMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/schedules\/([^/]+)\/(patch|matching-times)$/,
    );
    if (schedPatchMatch && request.method === "POST") {
      const namespace = decodeURIComponent(schedPatchMatch[1]!);
      const scheduleId = decodeURIComponent(schedPatchMatch[2]!);
      const action = schedPatchMatch[3]!;
      const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (action === "patch") {
        return Response.json(
          await client.patchSchedule(
            namespace,
            scheduleId,
            body as unknown as TemporalPatchScheduleInput,
          ),
        );
      }
      return Response.json({
        times: await client.listScheduleMatchingTimes({
          endTime: String(body.endTime ?? ""),
          namespace,
          scheduleId,
          startTime: String(body.startTime ?? ""),
        }),
      });
    }

    const schedDetailMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/schedules\/([^/]+)$/,
    );
    if (schedDetailMatch) {
      const namespace = decodeURIComponent(schedDetailMatch[1]!);
      const scheduleId = decodeURIComponent(schedDetailMatch[2]!);
      if (request.method === "GET") {
        return Response.json(
          await client.getScheduleDetail(namespace, scheduleId),
        );
      }
      if (request.method === "PUT") {
        return Response.json(
          await client.updateSchedule(
            namespace,
            scheduleId,
            (await request.json()) as TemporalCreateScheduleInput,
          ),
        );
      }
      if (request.method === "DELETE") {
        return Response.json(
          await client.deleteSchedule(namespace, scheduleId),
        );
      }
    }

    const workersMatch = subPath.match(/^\/v1\/namespaces\/([^/]+)\/workers$/);
    if (workersMatch && request.method === "GET") {
      return Response.json(
        await client.getWorkers(decodeURIComponent(workersMatch[1]!)),
      );
    }

    const facetsMatch = subPath.match(/^\/v1\/namespaces\/([^/]+)\/facets$/);
    if (facetsMatch && request.method === "GET") {
      return Response.json(
        await client.getFacets(decodeURIComponent(facetsMatch[1]!)),
      );
    }

    const typeInputsMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflow-types\/([^/]+)\/inputs$/,
    );
    if (typeInputsMatch && request.method === "GET") {
      return Response.json(
        await client.getTypeInputs(
          decodeURIComponent(typeInputsMatch[1]!),
          decodeURIComponent(typeInputsMatch[2]!),
        ),
      );
    }

    const typeMapMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/workflow-types\/([^/]+)\/map$/,
    );
    if (typeMapMatch && request.method === "GET") {
      return Response.json(
        await client.getTypeMap(
          decodeURIComponent(typeMapMatch[1]!),
          decodeURIComponent(typeMapMatch[2]!),
          {
            fresh: url.searchParams.get("fresh") === "1",
            sampleSize: Number(url.searchParams.get("sample")) || undefined,
          },
        ),
      );
    }

    const attentionMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/attention$/,
    );
    if (attentionMatch && request.method === "GET") {
      return Response.json(
        await client.getAttention(decodeURIComponent(attentionMatch[1]!)),
      );
    }

    // ---------- Task Queues route ----------
    const taskQueuesMatch = subPath.match(
      /^\/v1\/namespaces\/([^/]+)\/task-queues$/,
    );
    if (taskQueuesMatch && request.method === "GET") {
      const namespace = decodeURIComponent(taskQueuesMatch[1]!);
      return Response.json(await client.listTaskQueues(namespace));
    }

    // ---------- Cluster & Shards (slate-temporal-next Admin) ----------
    if (request.method === "GET" && subPath === "/v1/cluster/overview") {
      const window = url.searchParams.get("window") ?? "10s";
      return Response.json(await client.getClusterOverview(window));
    }

    if (request.method === "GET" && subPath === "/v1/cluster/traces") {
      const drain = url.searchParams.get("drain") === "true";
      return Response.json(await client.getClusterTraces(drain));
    }

    if (subPath === "/v1/cluster/admission") {
      const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (request.method === "PUT") {
        return Response.json(
          await client.setAdmission(
            body as unknown as TemporalAdmissionUpdateInput,
          ),
        );
      }
      if (request.method === "DELETE") {
        return Response.json(
          await client.liftAdmission({
            class: String(body.class ?? "new") as
              "wait" | "existing" | "new" | "batch",
            scope: typeof body.scope === "string" ? body.scope : undefined,
          }),
        );
      }
    }

    const handoffMatch = subPath.match(
      /^\/v1\/cluster\/shards\/(\d+)\/handoff$/,
    );
    if (handoffMatch && request.method === "POST") {
      const shardId = Number.parseInt(handoffMatch[1]!, 10);
      const body = (await request.json().catch(() => ({}))) as {
        to?: string;
      };
      return Response.json(
        await client.handoffShard(shardId, String(body.to ?? "")),
      );
    }

    if (request.method === "POST" && subPath === "/v1/cluster/tls/reload") {
      return Response.json(await client.reloadTls());
    }

    return Response.json({ error: `Not found: ${subPath}` }, { status: 404 });
  } catch (err) {
    return Response.json(
      { error: formatGrpcError(err) },
      { status: grpcStatusToHttp(err) },
    );
  }
}
