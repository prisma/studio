import { useEffect, useMemo, useState } from "react";

import type {
  TemporalExecutionDetail,
  TemporalFollowMode,
  TemporalSection,
} from "@/data/temporal";
import { useNavigation } from "@/ui/hooks/use-navigation";
import {
  useTemporalCapabilities,
  useTemporalFacets,
} from "@/ui/hooks/use-temporal";

import { TemporalAttentionView } from "./TemporalAttentionView";
import { TemporalClusterView } from "./TemporalClusterView";
import { TemporalExecutionDebugger } from "./TemporalExecutionDebugger";
import { TemporalSchedulesView } from "./TemporalSchedulesView";
import {
  type TemporalStartPreset,
  TemporalStartSheet,
} from "./TemporalStartSheet";
import { TemporalTaskQueuesView } from "./TemporalTaskQueuesView";
import { TemporalTypesView } from "./TemporalTypesView";
import { TemporalWorkersView } from "./TemporalWorkersView";
import { TemporalWorkflowsGrid } from "./TemporalWorkflowsGrid";

function normalizeFollowMode(
  raw: string | null | undefined,
): TemporalFollowMode {
  if (raw === "paused" || raw === "live" || raw === "tail") {
    return raw;
  }
  return "tail";
}

function normalizeSection(raw: string | null | undefined): TemporalSection {
  if (
    raw === "attention" ||
    raw === "schedules" ||
    raw === "queues" ||
    raw === "types" ||
    raw === "workers" ||
    raw === "cluster"
  ) {
    return raw;
  }
  return "workflows";
}

export function TemporalView() {
  const {
    searchParam,
    setSearchParam,
    temporalFollowParam,
    setTemporalFollowParam,
    temporalNsParam,
    temporalRunParam,
    setTemporalRunParam,
    temporalSectionParam,
    setTemporalSectionParam,
    temporalWfParam,
    setTemporalWfParam,
  } = useNavigation();

  const { data: capabilities } = useTemporalCapabilities();
  const namespace = temporalNsParam || "default";
  const followMode = normalizeFollowMode(temporalFollowParam);
  const rawSection = normalizeSection(temporalSectionParam);
  const section: TemporalSection =
    rawSection === "cluster" && !capabilities?.supportsAdminApi
      ? "workflows"
      : rawSection === "schedules" && capabilities?.supportsSchedules === false
        ? "workflows"
        : rawSection;
  const visibilityQuery = searchParam ?? "";

  const [startSheetOpen, setStartSheetOpen] = useState(false);
  // A run read from a history file. It is not on the server, so it is not in the URL.
  const [importedDetail, setImportedDetail] =
    useState<TemporalExecutionDetail | null>(null);
  const [startPreset, setStartPreset] = useState<TemporalStartPreset | null>(
    null,
  );

  // The Workflow Types and Task Queues in use, as suggestions in the forms.
  const { data: facets } = useTemporalFacets(namespace);
  const knownWorkflowTypes = useMemo(
    () => (facets?.workflowTypes ?? []).map((type) => type.name),
    [facets?.workflowTypes],
  );
  const knownTaskQueues = useMemo(
    () => (facets?.taskQueues ?? []).map((queue) => queue.name),
    [facets?.taskQueues],
  );

  const openStartSheet = (preset?: TemporalStartPreset | null) => {
    setStartPreset(preset ?? null);
    setStartSheetOpen(true);
  };

  // Opening a run adds a browser history entry, so the browser's Back button
  // returns to whichever screen the user came from.
  const openExecution = (workflowId: string, runId?: string) => {
    setImportedDetail(null);
    void setTemporalSectionParam("workflows", { history: "push" });
    void setTemporalWfParam(workflowId, { history: "push" });
    void setTemporalRunParam(runId ?? null, { history: "push" });
  };

  useEffect(() => {
    setImportedDetail(null);
  }, [
    searchParam,
    temporalNsParam,
    temporalRunParam,
    temporalSectionParam,
    temporalWfParam,
  ]);

  return (
    <>
      {importedDetail ? (
        <TemporalExecutionDebugger
          followMode="paused"
          imported={importedDetail}
          namespace={namespace}
          onClone={openStartSheet}
          onFollowModeChange={() => undefined}
          onOpenExecution={openExecution}
          runId={importedDetail.execution.runId}
          workflowId={importedDetail.execution.workflowId}
        />
      ) : temporalWfParam ? (
        <TemporalExecutionDebugger
          followMode={followMode}
          namespace={namespace}
          onClone={openStartSheet}
          onFollowModeChange={(m) => void setTemporalFollowParam(m)}
          onOpenExecution={openExecution}
          runId={temporalRunParam ?? undefined}
          workflowId={temporalWfParam}
        />
      ) : section === "schedules" ? (
        <TemporalSchedulesView
          followMode={followMode}
          knownTaskQueues={knownTaskQueues}
          knownWorkflowTypes={knownWorkflowTypes}
          namespace={namespace}
          onFollowModeChange={(m) => void setTemporalFollowParam(m)}
          onOpenExecution={openExecution}
        />
      ) : section === "attention" ? (
        <TemporalAttentionView
          followMode={followMode}
          namespace={namespace}
          onFollowModeChange={(m) => void setTemporalFollowParam(m)}
          onOpenExecution={openExecution}
        />
      ) : section === "queues" ? (
        <TemporalTaskQueuesView
          followMode={followMode}
          namespace={namespace}
          onFollowModeChange={(m) => void setTemporalFollowParam(m)}
          onOpenExecution={openExecution}
        />
      ) : section === "types" ? (
        <TemporalTypesView
          followMode={followMode}
          namespace={namespace}
          onFollowModeChange={(m) => void setTemporalFollowParam(m)}
          onOpenExecution={openExecution}
        />
      ) : section === "workers" ? (
        <TemporalWorkersView
          followMode={followMode}
          namespace={namespace}
          onFollowModeChange={(m) => void setTemporalFollowParam(m)}
        />
      ) : section === "cluster" ? (
        <TemporalClusterView
          followMode={followMode}
          onFollowModeChange={(m) => void setTemporalFollowParam(m)}
          onOpenExecution={openExecution}
        />
      ) : (
        <TemporalWorkflowsGrid
          followMode={followMode}
          namespace={namespace}
          onFollowModeChange={(m) => void setTemporalFollowParam(m)}
          onImportHistory={setImportedDetail}
          onOpenExecution={openExecution}
          onOpenStart={openStartSheet}
          onQueryChange={(q) => void setSearchParam(q)}
          query={visibilityQuery}
        />
      )}

      <TemporalStartSheet
        facets={facets}
        namespace={namespace}
        onOpenChange={setStartSheetOpen}
        onStarted={(wfId, runId) => {
          void setTemporalFollowParam("tail");
          openExecution(wfId, runId);
        }}
        open={startSheetOpen}
        preset={startPreset}
      />
    </>
  );
}
