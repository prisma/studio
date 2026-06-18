import { useQuery } from "@tanstack/react-query";

import type { WorkflowStudioModel } from "@/data/workflows";

import { useStudio } from "../studio/context";

const EMPTY_WORKFLOW_MODEL: WorkflowStudioModel = {
  kind: "prisma-workflow-studio-model",
  version: 1,
  warnings: [],
  workflows: [],
};

export function useWorkflows() {
  const { hasWorkflows, workflows } = useStudio();

  const query = useQuery<WorkflowStudioModel>({
    enabled: hasWorkflows && workflows !== undefined,
    queryKey: ["workflows"],
    queryFn: async ({ signal }) => {
      if (!workflows) {
        return EMPTY_WORKFLOW_MODEL;
      }

      return await workflows.getSnapshot({ signal });
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    ...query,
    data: query.data ?? EMPTY_WORKFLOW_MODEL,
    hasWorkflows,
    provider: workflows,
  };
}
