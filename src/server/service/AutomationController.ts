import type { TaskConfig, TaskStatus } from "../../lib/types/task";
import { ClaudeCodeTaskController } from "./claude-code/ClaudeCodeTaskController";
import type { AliveClaudeCodeTask } from "./claude-code/types";
import type { EventBus } from "./events/EventBus";
import { getEventBus } from "./events/EventBus";
import { getSession } from "./session/getSession";
import {
  type TaskProgress,
  taskMonitoringService,
} from "./TaskMonitoringService";
import {
  type TaskProgressError,
  taskProgressTracker,
} from "./TaskProgressTracker";
import type { SessionDetail } from "./types";
import type {
  AutomationError,
  AutomationStartResult,
  AutomationStatusResult,
} from "./types/automation";

/**
 * Task completion detection result
 */
export type CompletionDetectionResult =
  | {
      isComplete: true;
      progress: TaskProgress;
    }
  | {
      isComplete: false;
      progress?: TaskProgress;
      error?: TaskProgressError;
    };

/**
 * Controller for managing automated task execution and continuation.
 * Coordinates TaskMonitoringService and TaskProgressTracker with Claude Code integration.
 */
export class AutomationController {
  private activeTaskMap = new Map<string, ActiveTask>();
  private eventBus: EventBus;
  private claudeCodeController: ClaudeCodeTaskController;
  private maxRetries = 3;
  private monitoringIntervalMs = 5000;

  constructor() {
    this.eventBus = getEventBus();
    this.claudeCodeController = new ClaudeCodeTaskController();
  }

  /**
   * Start automated task execution
   * @param taskConfig - Task configuration
   * @param projectPath - Path to project directory
   * @returns Automation start result
   */
  public async startAutomation(
    taskConfig: TaskConfig,
    projectPath: string,
  ): Promise<AutomationStartResult> {
    try {
      // Check if task is already running
      if (this.activeTaskMap.has(taskConfig.id)) {
        return {
          success: false,
          error: {
            type: "start",
            message: "Task is already running",
            details: `Task ${taskConfig.id} is currently active`,
            timestamp: new Date(),
          },
        };
      }

      // Start Claude Code session
      const claudeCodeTask =
        await this.claudeCodeController.startOrContinueTask(
          {
            cwd: projectPath,
            projectId: taskConfig.projectId,
            sessionId: undefined, // Start new session
          },
          taskConfig.prompt,
        );

      // Create active task entry
      const activeTask: ActiveTask = {
        taskConfig,
        claudeCodeTask: claudeCodeTask as AliveClaudeCodeTask,
        status: "running",
        startTime: new Date(),
        retryCount: 0,
        lastMonitorTime: new Date(),
        monitoringInterval: null,
      };

      this.activeTaskMap.set(taskConfig.id, activeTask);

      // Start monitoring
      this.startTaskMonitoring(activeTask);

      // Emit task started event
      this.eventBus.emit("task_automation_started", {
        type: "task_automation_started",
        data: {
          taskId: taskConfig.id,
          sessionId: claudeCodeTask.sessionId,
          projectId: taskConfig.projectId,
        },
      });

      return {
        success: true,
        data: {
          taskId: taskConfig.id,
          sessionId: claudeCodeTask.sessionId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          type: "start",
          message: "Failed to start task automation",
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          originalError: error,
        },
      };
    }
  }

  /**
   * Cancel running automation
   * @param taskId - Task identifier
   * @returns True if cancellation was successful
   */
  public async cancelAutomation(taskId: string): Promise<boolean> {
    const activeTask = this.activeTaskMap.get(taskId);
    if (!activeTask) {
      return false;
    }

    try {
      // Stop monitoring
      this.stopTaskMonitoring(activeTask);

      // Abort Claude Code task
      this.claudeCodeController.abortTask(activeTask.claudeCodeTask.sessionId);

      // Update status
      activeTask.status = "cancelled";

      // Emit cancellation event
      this.eventBus.emit("task_automation_cancelled", {
        type: "task_automation_cancelled",
        data: {
          taskId,
          sessionId: activeTask.claudeCodeTask.sessionId,
          projectId: activeTask.taskConfig.projectId,
        },
      });

      // Remove from active tasks
      this.activeTaskMap.delete(taskId);

      return true;
    } catch (error) {
      console.error(`Failed to cancel task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Get automation status
   * @param taskId - Task identifier
   * @returns Automation status result
   */
  public getAutomationStatus(taskId: string): AutomationStatusResult | null {
    const activeTask = this.activeTaskMap.get(taskId);
    if (!activeTask) {
      return null;
    }

    return {
      taskId,
      status: activeTask.status,
      progress: activeTask.currentProgress,
      sessionId: activeTask.claudeCodeTask.sessionId,
      lastError: activeTask.lastError,
    };
  }

  /**
   * Get all active automation tasks
   * @returns Array of active task statuses
   */
  public getAllActiveAutomations(): AutomationStatusResult[] {
    return Array.from(this.activeTaskMap.values()).map((activeTask) => ({
      taskId: activeTask.taskConfig.id,
      status: activeTask.status,
      progress: activeTask.currentProgress,
      sessionId: activeTask.claudeCodeTask.sessionId,
      lastError: activeTask.lastError,
    }));
  }

  /**
   * Start monitoring task progress
   */
  private startTaskMonitoring(activeTask: ActiveTask): void {
    const monitoringInterval = setInterval(async () => {
      await this.checkTaskProgress(activeTask);
    }, this.monitoringIntervalMs);

    activeTask.monitoringInterval = monitoringInterval;
  }

  /**
   * Stop monitoring task progress
   */
  private stopTaskMonitoring(activeTask: ActiveTask): void {
    if (activeTask.monitoringInterval) {
      clearInterval(activeTask.monitoringInterval);
      activeTask.monitoringInterval = null;
    }
  }

  /**
   * Check task progress and handle completion/continuation
   */
  private async checkTaskProgress(activeTask: ActiveTask): Promise<void> {
    try {
      // Get session details (this would need to be implemented to fetch current session)
      const sessionDetail = await this.getSessionDetail(
        activeTask.taskConfig.projectId,
        activeTask.claudeCodeTask.sessionId,
      );

      if (!sessionDetail) {
        this.handleMonitoringError(activeTask, {
          type: "monitor",
          message: "Session not found during monitoring",
          timestamp: new Date(),
        });
        return;
      }

      // Monitor progress
      const progress = taskMonitoringService.monitorSession(
        sessionDetail,
        activeTask.taskConfig.id,
      );

      if (!progress) {
        // No spec-workflow activity yet, continue monitoring
        activeTask.lastMonitorTime = new Date();
        return;
      }

      // Update current progress
      activeTask.currentProgress = progress;
      activeTask.lastMonitorTime = new Date();

      // Check for completion
      const completionResult = this.detectTaskCompletion(progress);

      if (completionResult.isComplete) {
        await this.handleTaskCompletion(activeTask, completionResult.progress);
      } else if (completionResult.error) {
        this.handleMonitoringError(activeTask, {
          type: "monitor",
          message: "Progress validation failed",
          details: completionResult.error.message,
          timestamp: new Date(),
          originalError: completionResult.error,
        });
      }

      // Emit progress update event
      this.eventBus.emit("task_automation_progress", {
        type: "task_automation_progress",
        data: {
          taskId: activeTask.taskConfig.id,
          progress: activeTask.currentProgress,
          sessionId: activeTask.claudeCodeTask.sessionId,
        },
      });
    } catch (error) {
      this.handleMonitoringError(activeTask, {
        type: "monitor",
        message: "Unexpected error during task monitoring",
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        originalError: error,
      });
    }
  }

  /**
   * Detect if task is complete based on completion condition
   */
  private detectTaskCompletion(
    progress: TaskProgress,
  ): CompletionDetectionResult {
    try {
      // Validate progress data
      const validationResult =
        taskProgressTracker.validateProgressData(progress);

      if (!validationResult.success) {
        return {
          isComplete: false,
          error: validationResult.error,
        };
      }

      // Check if all tasks are completed
      const isComplete = taskProgressTracker.isAllTasksCompleted(progress);

      return {
        isComplete,
        progress,
      };
    } catch (error) {
      return {
        isComplete: false,
        error: {
          type: "validation",
          message: "Failed to detect task completion",
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          originalError: error,
        },
      };
    }
  }

  /**
   * Handle task completion
   */
  private async handleTaskCompletion(
    activeTask: ActiveTask,
    finalProgress: TaskProgress,
  ): Promise<void> {
    try {
      // Stop monitoring
      this.stopTaskMonitoring(activeTask);

      // Update status
      activeTask.status = "completed";
      activeTask.completionTime = new Date();

      // Emit completion event
      this.eventBus.emit("task_automation_completed", {
        type: "task_automation_completed",
        data: {
          taskId: activeTask.taskConfig.id,
          sessionId: activeTask.claudeCodeTask.sessionId,
          projectId: activeTask.taskConfig.projectId,
          finalProgress,
          completionTime: activeTask.completionTime,
        },
      });

      // Remove from active tasks after a delay to allow status queries
      setTimeout(() => {
        this.activeTaskMap.delete(activeTask.taskConfig.id);
      }, 60000); // Keep for 1 minute
    } catch (error) {
      this.handleMonitoringError(activeTask, {
        type: "completion",
        message: "Failed to handle task completion",
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        originalError: error,
      });
    }
  }

  /**
   * Handle monitoring errors with retry logic
   */
  private handleMonitoringError(
    activeTask: ActiveTask,
    error: AutomationError,
  ): void {
    activeTask.lastError = error;
    activeTask.retryCount++;

    console.error(
      `Task monitoring error for ${activeTask.taskConfig.id} (retry ${activeTask.retryCount}):`,
      error,
    );

    // If max retries exceeded, mark task as error and stop
    if (activeTask.retryCount >= this.maxRetries) {
      this.stopTaskMonitoring(activeTask);
      activeTask.status = "error";

      this.eventBus.emit("task_automation_error", {
        type: "task_automation_error",
        data: {
          taskId: activeTask.taskConfig.id,
          sessionId: activeTask.claudeCodeTask.sessionId,
          error,
          retryCount: activeTask.retryCount,
        },
      });

      // Remove from active tasks
      this.activeTaskMap.delete(activeTask.taskConfig.id);
    }
  }

  /**
   * Get session detail using existing session service
   */
  private async getSessionDetail(
    projectId: string,
    sessionId: string,
  ): Promise<SessionDetail | null> {
    try {
      const result = await getSession(projectId, sessionId);
      return result.session;
    } catch (error) {
      console.warn(
        `Failed to get session ${sessionId} for project ${projectId}:`,
        error,
      );
      return null;
    }
  }
}

/**
 * Internal active task tracking
 */
interface ActiveTask {
  taskConfig: TaskConfig;
  claudeCodeTask: AliveClaudeCodeTask;
  status: TaskStatus;
  startTime: Date;
  completionTime?: Date;
  retryCount: number;
  lastMonitorTime: Date;
  currentProgress?: TaskProgress;
  lastError?: AutomationError;
  monitoringInterval: NodeJS.Timeout | null;
}

// Export singleton instance
export const automationController = new AutomationController();
