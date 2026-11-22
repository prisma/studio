import { useMemo, useState } from "react";

import type { TemporalFollowMode, TemporalSection } from "@/data/temporal";
import { useNavigation } from "@/ui/hooks/use-navigation";
import {
  useTemporalCapabilities,
  useTemporalWorkflows,
} from "@/ui/hooks/use-temporal";

import { TemporalClusterView } from "./TemporalClusterView";
import { TemporalExecutionDebugger } from "./TemporalExecutionDebugger";
import { TemporalSchedulesView } from "./TemporalSchedulesView";
import {
  type TemporalStartPreset,
  TemporalStartSheet,
} from "./TemporalStartSheet";
import { TemporalTaskQueuesView } from "./TemporalTaskQueuesView";
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
  if (raw === "schedules" || raw === "queues" || raw === "cluster") {
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
  const [startPreset, setStartPreset] = useState<TemporalStartPreset | null>(
    null,
  );

  // Pull known workflow types & task queues for Start/Clone and Schedule forms
  const { data: listData } = useTemporalWorkflows({
    followMode: "paused",
    namespace,
    query: "",
  });

  const knownWorkflowTypes = useMemo(() => {
    const set = new Set<string>([
      "ChargeOrder",
      "MoneyTransfer",
      "SubscriptionRenewal",
    ]);
    for (const exec of listData?.executions ?? []) {
      set.add(exec.workflowType);
    }
    return Array.from(set);
  }, [listData?.executions]);

  const knownTaskQueues = useMemo(() => {
    const set = new Set<string>(["billing", "default"]);
    for (const exec of listData?.executions ?? []) {
      set.add(exec.taskQueue);
    }
    return Array.from(set);
  }, [listData?.executions]);

  const openStartSheet = (preset?: TemporalStartPreset | null) => {
    setStartPreset(preset ?? null);
    setStartSheetOpen(true);
  };

  const openExecution = (workflowId: string, runId?: string) => {
    void setTemporalSectionParam("workflows");
    void setTemporalWfParam(workflowId);
    void setTemporalRunParam(runId ?? null);
  };

  const closeExecution = () => {
    void setTemporalWfParam(null);
    void setTemporalRunParam(null);
  };

  return (
    <>
      {temporalWfParam ? (
        <TemporalExecutionDebugger
          followMode={followMode}
          namespace={namespace}
          onBack={closeExecution}
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
      ) : section === "queues" ? (
        <TemporalTaskQueuesView
          followMode={followMode}
          namespace={namespace}
          onFollowModeChange={(m) => void setTemporalFollowParam(m)}
          onOpenExecution={openExecution}
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
          onOpenExecution={openExecution}
          onOpenStart={openStartSheet}
          onQueryChange={(q) => void setSearchParam(q)}
          query={visibilityQuery}
        />
      )}

      <TemporalStartSheet
        knownTaskQueues={knownTaskQueues}
        knownWorkflowTypes={knownWorkflowTypes}
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
