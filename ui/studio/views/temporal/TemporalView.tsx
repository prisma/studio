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
    createUrl,
    searchParam,
    setSearchParam,
    setSortParam,
    setTemporalScheduleParam,
    setTemporalSectionParam,
    setTemporalStatusParam,
    setTemporalTypeParam,
    sortParam,
    temporalFollowParam,
    setTemporalFollowParam,
    temporalNsParam,
    temporalRunParam,
    temporalScheduleParam,
    temporalSectionParam,
    temporalStatusParam,
    temporalTypeParam,
    temporalWfParam,
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
        : rawSection === "workers" &&
            capabilities?.supportsDescribeTaskQueue === false
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

  // A workflow page has one URL: the namespace, the Workflow ID, and the run.
  // Where it was opened from is not in it, so a link is the same wherever it is
  // copied, and the left menu always marks Workflows. Opening a workflow adds a
  // browser history entry, so the Back button returns to the list with its filter.
  const openExecution = (workflowId: string, runId?: string) => {
    setImportedDetail(null);
    window.location.hash = createUrl({
      ...(temporalFollowParam ? { temporalFollowParam } : {}),
      temporalNsParam: namespace,
      ...(runId ? { temporalRunParam: runId } : {}),
      temporalWfParam: workflowId,
      viewParam: "temporal",
    });
  };

  // An older link to a workflow carries the screen and filter it was opened
  // from. They are dropped in place, so the address becomes the workflow's one URL.
  useEffect(() => {
    if (
      temporalWfParam &&
      (temporalSectionParam ||
        searchParam ||
        sortParam ||
        temporalStatusParam ||
        temporalScheduleParam ||
        temporalTypeParam)
    ) {
      const replace = { history: "replace" } as const;

      void setTemporalSectionParam(null, replace);
      void setSearchParam(null, replace);
      void setSortParam(null, replace);
      void setTemporalStatusParam(null, replace);
      void setTemporalScheduleParam(null, replace);
      void setTemporalTypeParam(null, replace);
    }
  }, [
    searchParam,
    setSearchParam,
    setSortParam,
    setTemporalScheduleParam,
    setTemporalSectionParam,
    setTemporalStatusParam,
    setTemporalTypeParam,
    sortParam,
    temporalScheduleParam,
    temporalSectionParam,
    temporalStatusParam,
    temporalTypeParam,
    temporalWfParam,
  ]);

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
          key={`${namespace}\n${temporalWfParam}`}
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
