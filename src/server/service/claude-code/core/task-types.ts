/**
 * Unified task type definitions - Single Source of Truth for all task-related types.
 * Consolidates task types from multiple files to eliminate duplication.
 */

/**
 * Task execution status - unified across all components
 */
export type TaskStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";

/**
 * Task completion detection methods
 */
export type CompletionCondition = "spec-workflow" | "manual";

/**
 * Base task properties shared across all task states
 */
export interface BaseTask {
  readonly id: string;
  readonly projectId: string;
  readonly cwd: string;
  readonly status: TaskStatus;
  readonly completionCondition?: CompletionCondition;
  readonly originalPrompt?: string;
  readonly autoContinue?: boolean;
  readonly lastActivity: number;
  readonly baseSessionId?: string;
}

/**
 * Task in pending state - not yet started
 */
export interface PendingTask extends BaseTask {
  readonly status: "pending";
}

/**
 * Task in running state - actively executing
 */
export interface RunningTask extends BaseTask {
  readonly status: "running";
  readonly sessionId: string;
  readonly userMessageId: string;
  readonly abortController: AbortController;
}

/**
 * Task in paused state - waiting for input
 */
export interface PausedTask extends BaseTask {
  readonly status: "paused";
  readonly sessionId: string;
  readonly userMessageId: string;
  readonly abortController: AbortController;
}

/**
 * Task in completed state - finished successfully
 */
export interface CompletedTask extends BaseTask {
  readonly status: "completed";
  readonly sessionId: string;
  readonly userMessageId: string;
}

/**
 * Task in failed state - encountered error
 */
export interface FailedTask extends BaseTask {
  readonly status: "failed";
  readonly sessionId?: string;
  readonly userMessageId?: string;
  readonly error?: string;
}

/**
 * Union type for all possible task states
 */
export type Task =
  | PendingTask
  | RunningTask
  | PausedTask
  | CompletedTask
  | FailedTask;

/**
 * Union type for tasks that are actively managed (not terminal)
 */
export type AliveTask = RunningTask | PausedTask;

/**
 * Serializable subset of alive task data for API responses
 */
export type SerializableAliveTask = Pick<
  AliveTask,
  | "id"
  | "status"
  | "sessionId"
  | "userMessageId"
  | "completionCondition"
  | "originalPrompt"
  | "autoContinue"
  | "lastActivity"
>;

/**
 * Configuration for creating new tasks
 */
export interface TaskSessionConfig {
  readonly cwd: string;
  readonly projectId: string;
  readonly sessionId?: string;
  readonly completionCondition?: CompletionCondition;
  readonly autoContinue?: boolean;
}

/**
 * Task progress tracking data
 */
export interface TaskProgress {
  readonly taskId: string;
  readonly sessionId?: string;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly lastUpdated: Date;
  readonly workflowResults: WorkflowResult[];
}

/**
 * Workflow execution result data
 */
export interface WorkflowResult {
  readonly toolName: "mcp__spec-workflow__manage-tasks";
  readonly timestamp: Date;
  readonly success: boolean;
  readonly message: string;
  readonly summary: {
    readonly total: number;
    readonly completed: number;
    readonly inProgress?: number;
    readonly pending?: number;
  };
}

/**
 * Type guards for task state discrimination
 */
export const TaskGuards = {
  isPending: (task: Task): task is PendingTask => task.status === "pending",
  isRunning: (task: Task): task is RunningTask => task.status === "running",
  isPaused: (task: Task): task is PausedTask => task.status === "paused",
  isCompleted: (task: Task): task is CompletedTask =>
    task.status === "completed",
  isFailed: (task: Task): task is FailedTask => task.status === "failed",
  isAlive: (task: Task): task is AliveTask =>
    task.status === "running" || task.status === "paused",
  isTerminal: (task: Task): task is CompletedTask | FailedTask =>
    task.status === "completed" || task.status === "failed",
} as const;
