import type { ClaudeCodeTaskController } from "./claude-code/ClaudeCodeTaskController";
import type { EventBus } from "./events/EventBus";
import { getEventBus } from "./events/EventBus";

/**
 * Background service for automatic task management and auto-continuation.
 * Runs independently of browser sessions to ensure tasks continue even when UI is not active.
 */
export class BackgroundTaskService {
  private readonly eventBus: EventBus;
  private taskController: ClaudeCodeTaskController | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly timeoutMs = 120 * 1000; // 120 seconds (2 minutes)
  private readonly checkIntervalMs = 30 * 1000; // Check every 30 seconds
  private isRunning = false;

  constructor() {
    this.eventBus = getEventBus();
  }

  /**
   * Initialize the background service with task controller
   */
  initialize(taskController: ClaudeCodeTaskController): void {
    this.taskController = taskController;
    console.log("[BackgroundTaskService] Initialized with task controller");
  }

  /**
   * Start the background task monitoring service
   */
  start(): void {
    if (this.isRunning) {
      console.warn("[BackgroundTaskService] Service is already running");
      return;
    }

    if (!this.taskController) {
      throw new Error(
        "BackgroundTaskService must be initialized with task controller before starting",
      );
    }

    console.log("[BackgroundTaskService] Starting background task monitoring");
    this.isRunning = true;

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.checkTaskTimeouts();
    }, this.checkIntervalMs);

    // Emit service started event
    this.eventBus.emit("background_service_started", {
      type: "background_service_started",
      data: {
        checkIntervalMs: this.checkIntervalMs,
        timeoutMs: this.timeoutMs,
      },
    });
  }

  /**
   * Stop the background task monitoring service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log("[BackgroundTaskService] Stopping background task monitoring");

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;

    // Emit service stopped event
    this.eventBus.emit("background_service_stopped", {
      type: "background_service_stopped",
    });
  }

  /**
   * Check for timed-out tasks and trigger auto-continuation
   */
  private async checkTaskTimeouts(): Promise<void> {
    if (!this.taskController) {
      return;
    }

    const now = Date.now();

    try {
      // Check for timed-out tasks and trigger auto-continuation
      for (const task of this.taskController.aliveTasks) {
        const inactivityMs = now - task.lastActivity;
        const isTimedOut = inactivityMs > this.timeoutMs;

        if (isTimedOut && task.status === "running") {
          console.log(
            `[BackgroundTaskService] Task ${task.id} timed out (${Math.round(inactivityMs / 1000)}s since last activity)`,
          );

          // Always try to continue with a new session instead of aborting
          if (task.originalPrompt) {
            console.log(
              `[BackgroundTaskService] Creating new session for task ${task.id} to continue work`,
            );

            try {
              // Create a new session for the same task instead of continuing the old one
              const continuedTask =
                await this.taskController.startOrContinueTask(
                  {
                    sessionId: undefined, // Don't pass sessionId to create a new session
                    cwd: task.cwd,
                    projectId: task.projectId,
                    completionCondition: task.completionCondition,
                    autoContinue: true, // Enable auto-continue for new session
                  },
                  task.originalPrompt,
                );

              console.log(
                `[BackgroundTaskService] Task ${task.id} continued with new session ${continuedTask.sessionId}`,
              );

              // Emit task session continued event
              this.eventBus.emit("task_session_continued", {
                type: "task_session_continued",
                data: {
                  taskId: task.id,
                  oldSessionId: task.sessionId,
                  newSessionId: continuedTask.sessionId,
                  projectId: task.projectId,
                },
              });

              // Mark the old task as completed since we're moving to a new session
              console.log(
                `[BackgroundTaskService] Marking old session ${task.sessionId} as completed`,
              );
              this.taskController.abortTask(
                task.sessionId,
                "Session completed - continued in new session",
              );
            } catch (error) {
              console.error(
                `[BackgroundTaskService] Failed to create new session for task ${task.id}:`,
                error,
              );

              // Emit error event
              this.eventBus.emit("task_continue_error", {
                type: "task_continue_error",
                data: {
                  taskId: task.id,
                  sessionId: task.sessionId,
                  projectId: task.projectId,
                  error: error instanceof Error ? error.message : String(error),
                },
              });

              // Only abort if new session creation fails
              console.log(
                `[BackgroundTaskService] Aborting task ${task.id} - failed to create new session`,
              );
              this.taskController.abortTask(
                task.sessionId,
                "Failed to create new session for continuation",
              );
            }
          } else {
            // No original prompt available, abort the timed-out task
            console.log(
              `[BackgroundTaskService] Aborting timed-out task ${task.id} (no original prompt available)`,
            );
            this.taskController.abortTask(
              task.sessionId,
              `Task timed out after ${Math.round(inactivityMs / 1000)}s of inactivity - no continuation possible`,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        "[BackgroundTaskService] Error during task timeout check:",
        error,
      );
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean;
    checkIntervalMs: number;
    timeoutMs: number;
    activeTaskCount: number;
  } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
      timeoutMs: this.timeoutMs,
      activeTaskCount: this.taskController?.aliveTasks.length ?? 0,
    };
  }
}

// Export singleton instance
export const backgroundTaskService = new BackgroundTaskService();
