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

export interface TaskProgressResponse {
  total: number;
  completed: number;
  pending: number;
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
            signal: AbortSignal.timeout(60 * 1000),
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
            signal: AbortSignal.timeout(60 * 1000),
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

export const useTaskProgressMonitor = (
  projectId: string,
  sessionId: string | undefined,
) => {
  return useQuery({
    queryKey: ["task-progress", projectId, sessionId],
    queryFn: async (): Promise<TaskProgressResponse | null> => {
      if (!sessionId || !projectId) return null;

      const response = await honoClient.api.projects[":projectId"].tasks[
        ":sessionId"
      ].progress.$get({
        param: { projectId, sessionId },
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      const data = await response.json();
      return data.taskProgress;
    },
    enabled: !!sessionId && !!projectId,
    refetchInterval: 3000, // Check progress every 3 seconds
    refetchIntervalInBackground: false,
  });
};
