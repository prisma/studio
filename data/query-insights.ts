import type { ExecuteOptions } from "./executor";
import type { Either } from "./type-utils";

export interface StudioQueryInsightPrismaQueryInfo {
  action: string;
  isRaw: boolean;
  model?: string;
  payload?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export interface StudioQueryInsightQuery {
  count: number;
  duration: number;
  groupKey?: string | null;
  id: string;
  lastSeen: number;
  maxDurationMs?: number | null;
  minDurationMs?: number | null;
  prismaQueryInfo?: StudioQueryInsightPrismaQueryInfo | null;
  query: string;
  queryId?: string | null;
  reads: number;
  rowsReturned: number;
  tables: string[];
}

export interface StudioQueryInsightsSnapshot {
  generatedAt: number;
  pollingIntervalMs?: number;
  queries: StudioQueryInsightQuery[];
}

export interface StudioQueryInsightsSnapshotRequest {
  limit?: number;
  since?: number;
}

export interface StudioQueryInsights {
  getSnapshot(
    request: StudioQueryInsightsSnapshotRequest,
    options?: ExecuteOptions,
  ): Promise<Either<Error, StudioQueryInsightsSnapshot>>;
}
