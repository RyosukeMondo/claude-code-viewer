import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * Task configuration interface
 */
export interface TaskConfig {
  id: string;
  projectId: string;
  prompt: string;
  completionCondition: "spec-workflow";
  createdAt: Date;
  status: "pending" | "running" | "completed" | "cancelled" | "error";
}

/**
 * Task progress tracking interface
 */
export interface TaskProgress {
  taskId: string;
  sessionId?: string;
  totalTasks: number;
  completedTasks: number;
  lastUpdated: Date;
}

/**
 * Task execution status interface
 */
export interface TaskExecutionStatus {
  isRunning: boolean;
  currentTaskId?: string;
  currentSessionId?: string;
  startedAt?: Date;
  lastActivity?: Date;
}

const defaultExecutionStatus: TaskExecutionStatus = {
  isRunning: false,
};

/**
 * Atom for current task execution status
 */
export const taskExecutionStatusAtom = atom<TaskExecutionStatus>(
  defaultExecutionStatus,
);

/**
 * Atom for storing active task configurations with localStorage persistence
 */
export const activeTaskConfigsAtom = atomWithStorage<
  Record<string, TaskConfig>
>("claude-code-viewer-active-tasks", {});

/**
 * Atom for storing task progress with localStorage persistence
 */
export const taskProgressAtom = atomWithStorage<Record<string, TaskProgress>>(
  "claude-code-viewer-task-progress",
  {},
);

/**
 * Derived atom to get active task for a specific project
 */
export const activeTaskForProjectAtom = (projectId: string) =>
  atom((get) => {
    const activeConfigs = get(activeTaskConfigsAtom);
    return Object.values(activeConfigs).find(
      (config) => config.projectId === projectId && config.status === "running",
    );
  });

/**
 * Derived atom to check if any task is currently running
 */
export const hasRunningTaskAtom = atom((get) => {
  const status = get(taskExecutionStatusAtom);
  return status.isRunning;
});

/**
 * Derived atom to get task progress by task ID
 */
export const taskProgressByIdAtom = (taskId: string) =>
  atom((get) => {
    const progress = get(taskProgressAtom);
    return progress[taskId];
  });

/**
 * Write atom for updating task configuration
 */
export const updateTaskConfigAtom = atom(
  null,
  (
    get,
    set,
    { taskId, updates }: { taskId: string; updates: Partial<TaskConfig> },
  ) => {
    const activeConfigs = get(activeTaskConfigsAtom);
    const currentConfig = activeConfigs[taskId];

    if (currentConfig) {
      set(activeTaskConfigsAtom, {
        ...activeConfigs,
        [taskId]: { ...currentConfig, ...updates },
      });
    }
  },
);

/**
 * Write atom for updating task progress
 */
export const updateTaskProgressAtom = atom(
  null,
  (
    get,
    set,
    { taskId, progress }: { taskId: string; progress: Partial<TaskProgress> },
  ) => {
    const currentProgress = get(taskProgressAtom);
    const existingProgress = currentProgress[taskId];

    set(taskProgressAtom, {
      ...currentProgress,
      [taskId]: {
        taskId,
        sessionId: existingProgress?.sessionId,
        totalTasks: existingProgress?.totalTasks ?? 0,
        completedTasks: existingProgress?.completedTasks ?? 0,
        lastUpdated: new Date(),
        ...progress,
      },
    });
  },
);

/**
 * Write atom for starting a new task
 */
export const startTaskAtom = atom(null, (get, set, config: TaskConfig) => {
  // Update task config
  const activeConfigs = get(activeTaskConfigsAtom);
  set(activeTaskConfigsAtom, {
    ...activeConfigs,
    [config.id]: config,
  });

  // Update execution status
  set(taskExecutionStatusAtom, {
    isRunning: true,
    currentTaskId: config.id,
    startedAt: new Date(),
    lastActivity: new Date(),
  });

  // Initialize progress
  set(updateTaskProgressAtom, {
    taskId: config.id,
    progress: {
      totalTasks: 0,
      completedTasks: 0,
    },
  });
});

/**
 * Write atom for stopping/cancelling a task
 */
export const stopTaskAtom = atom(null, (get, set, taskId: string) => {
  const activeConfigs = get(activeTaskConfigsAtom);
  const taskConfig = activeConfigs[taskId];

  if (taskConfig) {
    // Update task status to cancelled
    set(updateTaskConfigAtom, {
      taskId,
      updates: { status: "cancelled" },
    });

    // Clear execution status if this is the current task
    const currentStatus = get(taskExecutionStatusAtom);
    if (currentStatus.currentTaskId === taskId) {
      set(taskExecutionStatusAtom, defaultExecutionStatus);
    }
  }
});

/**
 * Write atom for completing a task
 */
export const completeTaskAtom = atom(null, (get, set, taskId: string) => {
  // Update task status to completed
  set(updateTaskConfigAtom, {
    taskId,
    updates: { status: "completed" },
  });

  // Clear execution status if this is the current task
  const currentStatus = get(taskExecutionStatusAtom);
  if (currentStatus.currentTaskId === taskId) {
    set(taskExecutionStatusAtom, defaultExecutionStatus);
  }
});

/**
 * Write atom for cleaning up completed/cancelled tasks
 */
export const cleanupTasksAtom = atom(
  null,
  (get, set, maxAge: number = 24 * 60 * 60 * 1000) => {
    // 24 hours default
    const activeConfigs = get(activeTaskConfigsAtom);
    const taskProgress = get(taskProgressAtom);
    const cutoffTime = new Date(Date.now() - maxAge);

    const cleanedConfigs: Record<string, TaskConfig> = {};
    const cleanedProgress: Record<string, TaskProgress> = {};

    // Keep tasks that are still running or recently completed
    Object.entries(activeConfigs).forEach(([id, config]) => {
      if (
        config.status === "running" ||
        config.status === "pending" ||
        config.createdAt > cutoffTime
      ) {
        cleanedConfigs[id] = config;
      }
    });

    // Keep progress for remaining tasks
    Object.entries(taskProgress).forEach(([id, progress]) => {
      if (cleanedConfigs[id] || progress.lastUpdated > cutoffTime) {
        cleanedProgress[id] = progress;
      }
    });

    set(activeTaskConfigsAtom, cleanedConfigs);
    set(taskProgressAtom, cleanedProgress);
  },
);
