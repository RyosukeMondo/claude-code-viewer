/**
 * Task configuration types for the automated task execution feature.
 * These interfaces provide type safety for task management functionality.
 */

/**
 * Task status enum for tracking execution state
 */
export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "cancelled"
  | "error";

/**
 * Completion condition types for task automation
 */
export type CompletionCondition = "spec-workflow";

/**
 * Configuration for an automated task
 */
export interface TaskConfig {
  /** Unique task identifier */
  id: string;
  /** Associated project ID */
  projectId: string;
  /** Predefined prompt text to execute */
  prompt: string;
  /** Completion detection method */
  completionCondition: CompletionCondition;
  /** Task creation timestamp */
  createdAt: Date;
  /** Current task execution status */
  status: TaskStatus;
}

/**
 * Progress tracking for task execution
 */
export interface TaskProgress {
  /** Associated task ID */
  taskId: string;
  /** Current Claude Code session ID */
  sessionId?: string;
  /** Total tasks from spec-workflow */
  totalTasks: number;
  /** Completed tasks count */
  completedTasks: number;
  /** Last progress update timestamp */
  lastUpdated: Date;
  /** Captured tool results from monitoring */
  toolResults: SpecWorkflowResult[];
}

/**
 * Spec-workflow tool result structure
 */
export interface SpecWorkflowResult {
  /** Tool name identifier */
  toolName: "mcp__spec-workflow__manage-tasks";
  /** Tool execution timestamp */
  timestamp: Date;
  /** Tool result data */
  data: {
    /** Execution success status */
    success: boolean;
    /** Result message */
    message: string;
    /** Detailed result data */
    data: {
      /** Task summary information */
      summary: {
        /** Total number of tasks */
        total: number;
        /** Number of completed tasks */
        completed: number;
        /** Number of tasks in progress */
        inProgress?: number;
        /** Number of pending tasks */
        pending?: number;
      };
    };
  };
}

/**
 * Task creation request payload
 */
export interface CreateTaskRequest {
  /** Project ID for the task */
  projectId: string;
  /** Predefined prompt text */
  prompt: string;
  /** Completion condition type */
  completionCondition: CompletionCondition;
}

/**
 * Task status update payload
 */
export interface TaskStatusUpdate {
  /** Task ID */
  taskId: string;
  /** New task status */
  status: TaskStatus;
  /** Optional session ID */
  sessionId?: string;
  /** Optional progress data */
  progress?: Partial<TaskProgress>;
}
