import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { honoClient } from "../../../../../../lib/api/client";
import { aliveTasksAtom } from "../store/aliveTasksAtom";

/**
 * Hook for monitoring alive tasks with simplified polling logic.
 *
 * PRINCIPLES APPLIED:
 * - KISS: Removed complex circuit breaker and manual poll counting
 * - SRP: Single responsibility - just fetch and provide task status
 * - SLAP: Single level of abstraction - high-level task monitoring only
 */
export const useAliveTask = (sessionId: string, _projectId: string) => {
  const [aliveTasks, setAliveTasks] = useAtom(aliveTasksAtom);

  // Simple polling with built-in TanStack Query error handling
  useQuery({
    queryKey: ["aliveTasks"],
    queryFn: async () => {
      const response = await honoClient.api.tasks.alive.$get({});

      if (!response.ok) {
        throw new Error(`Failed to fetch alive tasks: ${response.statusText}`);
      }

      const data = await response.json();
      setAliveTasks(data.aliveTasks);
      return data;
    },
    refetchInterval: (data) => {
      // Adaptive polling: faster when tasks are running, slower when idle
      const hasRunningTasks = data?.aliveTasks?.some(
        (task: any) => task.status === "running",
      );
      return hasRunningTasks ? 2000 : 10000; // 2s when running, 10s when idle
    },
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    // Built-in error boundaries and retry logic - no custom circuit breaker needed
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Simple task status derivation
  const taskInfo = useMemo(() => {
    const aliveTask = aliveTasks.find((task) => task.sessionId === sessionId);

    return {
      aliveTask,
      isRunningTask: aliveTask?.status === "running",
      isPausedTask: aliveTask?.status === "paused",
    } as const;
  }, [aliveTasks, sessionId]);

  return taskInfo;
};
