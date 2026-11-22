import { useMemo, useState } from "react";

import type { TemporalFollowMode } from "@/data/temporal";
import { useNavigation } from "@/ui/hooks/use-navigation";
import { useTemporalWorkflows } from "@/ui/hooks/use-temporal";

import { TemporalExecutionDebugger } from "./TemporalExecutionDebugger";
import {
  type TemporalStartPreset,
  TemporalStartSheet,
} from "./TemporalStartSheet";
import { TemporalWorkflowsGrid } from "./TemporalWorkflowsGrid";

function normalizeFollowMode(
  raw: string | null | undefined,
): TemporalFollowMode {
  if (raw === "paused" || raw === "live" || raw === "tail") {
    return raw;
  }
  return "tail";
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
    temporalWfParam,
    setTemporalWfParam,
  } = useNavigation();

  const namespace = temporalNsParam || "default";
  const followMode = normalizeFollowMode(temporalFollowParam);
  const visibilityQuery = searchParam ?? "";

  const [startSheetOpen, setStartSheetOpen] = useState(false);
  const [startPreset, setStartPreset] = useState<TemporalStartPreset | null>(
    null,
  );

  // Pull known workflow types & task queues for Start/Clone autocomplete
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
