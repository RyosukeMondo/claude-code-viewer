import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { honoClient } from "../../../../../lib/api/client";

export interface TaskConfig {
  id: string;
  projectId: string;
  prompt: string;
  completionCondition: "spec-workflow";
  createdAt: Date;
  status: "pending" | "running" | "completed" | "cancelled" | "error";
}

export interface TaskProgress {
  taskId: string;
  sessionId?: string;
  totalTasks: number;
  completedTasks: number;
  lastUpdated: Date;
}

export const useStartTaskMutation = (
  projectId: string,
  onSuccess?: (taskId: string, sessionId: string) => void,
) => {
  const router = useRouter();

  return useMutation({
    mutationFn: async (options: {
      prompt: string;
      completionCondition?: "spec-workflow";
      autoContinue?: boolean;
    }) => {
      const response = await honoClient.api.projects[
        ":projectId"
      ].tasks.start.$post(
        {
          param: { projectId },
          json: {
            prompt: options.prompt,
            completionCondition: options.completionCondition || "spec-workflow",
            autoContinue: options.autoContinue ?? true,
          },
        },
        {
          init: {
            signal: AbortSignal.timeout(20 * 1000),
          },
        },
      );

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      return response.json();
    },
    onSuccess: async (response) => {
      onSuccess?.(response.taskId, response.sessionId);
      router.push(
        `/projects/${projectId}/sessions/${response.sessionId}#message-${response.userMessageId}`,
      );
    },
  });
};

export const useResumeTaskMutation = (
  projectId: string,
  sessionId: string,
  onSuccess?: (taskId: string, sessionId: string) => void,
) => {
  const router = useRouter();

  return useMutation({
    mutationFn: async (options: {
      prompt: string;
      completionCondition?: "spec-workflow";
      autoContinue?: boolean;
    }) => {
      const response = await honoClient.api.projects[":projectId"].tasks[
        ":sessionId"
      ].continue.$post(
        {
          param: { projectId, sessionId },
          json: {
            prompt: options.prompt,
            completionCondition: options.completionCondition || "spec-workflow",
            autoContinue: options.autoContinue ?? true,
          },
        },
        {
          init: {
            signal: AbortSignal.timeout(20 * 1000),
          },
        },
      );

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      return response.json();
    },
    onSuccess: async (response) => {
      onSuccess?.(response.taskId, response.sessionId);
      if (sessionId !== response.sessionId) {
        router.push(
          `/projects/${projectId}/sessions/${response.sessionId}#message-${response.userMessageId}`,
        );
      }
    },
  });
};

export const useAbortTaskMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: { sessionId: string }) => {
      const response = await honoClient.api.tasks.abort.$post({
        json: { sessionId: options.sessionId },
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate alive tasks query to refresh status
      queryClient.invalidateQueries({ queryKey: ["tasks", "alive"] });
    },
  });
};

export const useAliveTasksQuery = () => {
  return useQuery({
    queryKey: ["tasks", "alive"],
    queryFn: async () => {
      const response = await honoClient.api.tasks.alive.$get();

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      return response.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds for active task status
    refetchIntervalInBackground: true,
  });
};

export const useTaskProgressMonitor = (sessionId: string | undefined) => {
  return useQuery({
    queryKey: ["task-progress", sessionId],
    queryFn: async (): Promise<TaskProgress | null> => {
      if (!sessionId) return null;

      // This would need to be implemented to monitor conversation for spec-workflow tool usage
      // For now, return null as placeholder
      return null;
    },
    enabled: !!sessionId,
    refetchInterval: 3000, // Check progress every 3 seconds
    refetchIntervalInBackground: false,
  });
};
