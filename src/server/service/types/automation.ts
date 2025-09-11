/**
 * Automation error types
 */
export type AutomationError = {
  type: "start" | "monitor" | "completion" | "system" | "cancellation";
  message: string;
  details?: string;
  timestamp: Date;
  originalError?: unknown;
};

/**
 * Result of automation start operation
 */
export type AutomationStartResult =
  | {
      success: true;
      data: {
        taskId: string;
        sessionId: string;
        initialProgress?: import("../TaskMonitoringService").TaskProgress;
      };
    }
  | {
      success: false;
      error: AutomationError;
    };

/**
 * Result of automation status check
 */
export type AutomationStatusResult = {
  taskId: string;
  status: import("../../../lib/types/task").TaskStatus;
  progress?: import("../TaskMonitoringService").TaskProgress;
  sessionId?: string;
  lastError?: AutomationError;
};
