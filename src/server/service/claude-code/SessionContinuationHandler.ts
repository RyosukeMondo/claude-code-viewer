import type { EventBus } from "../events/EventBus";
import type { AliveClaudeCodeTask, TaskSessionConfig } from "./types";

/**
 * Handles session continuation logic including auto-continue and navigation events.
 * Responsible for starting new sessions and managing navigation.
 */
export class SessionContinuationHandler {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Handles auto-continuation of a task with a new session
   */
  public async handleAutoContinue(
    currentTask: AliveClaudeCodeTask,
    startTask: (
      config: TaskSessionConfig,
      message: string,
    ) => Promise<AliveClaudeCodeTask>,
    completeTask: (taskId: string) => void,
    reason:
      | "spec_workflow_incomplete"
      | "no_spec_workflow_activity" = "spec_workflow_incomplete",
  ): Promise<void> {
    if (!currentTask.autoContinue || !currentTask.originalPrompt) {
      throw new Error("Task is not configured for auto-continue");
    }

    console.log(
      `[SessionContinuation] Auto-continuing task ${currentTask.id} with new session (${reason})`,
    );

    // Use setTimeout to avoid blocking the current task completion
    setTimeout(async () => {
      try {
        // Mark current task as completed
        completeTask(currentTask.id);

        console.log(
          `[SessionContinuation] Starting auto-continue for task ${currentTask.id} (${reason})`,
        );

        // Start new task with same configuration
        const newTask = await startTask(
          {
            projectId: currentTask.projectId,
            cwd: currentTask.cwd,
            completionCondition: currentTask.completionCondition,
            autoContinue: currentTask.autoContinue,
          },
          currentTask.originalPrompt!,
        );

        console.log(
          `[SessionContinuation] Auto-continue successful (${reason}): task ${newTask.id}, session: ${newTask.sessionId}`,
        );

        // Navigate to new session
        this.navigateToSession(currentTask.projectId, newTask);

        // Set fallback navigation
        this.setFallbackNavigation(currentTask.projectId, newTask);
      } catch (error) {
        console.error(
          `[SessionContinuation] Auto-continue failed (${reason}):`,
          error,
        );
        this.handleContinuationFailure(currentTask);
      }
    }, 2000); // Delay to ensure current session is properly closed
  }

  /**
   * Handles manual continuation requirement
   */
  public handleManualContinuation(
    currentTask: AliveClaudeCodeTask,
    reason:
      | "spec_workflow_incomplete"
      | "spec_workflow_no_activity"
      | "auto_continue_failed",
  ): void {
    console.log(
      `[SessionContinuation] Manual continuation required (${reason})`,
    );

    this.eventBus.emit("navigate_to_project", {
      type: "navigate_to_project",
      data: {
        projectId: currentTask.projectId,
        taskId: currentTask.id,
        originalPrompt: currentTask.originalPrompt,
        reason,
        autoContinue: false,
      },
    });
  }

  private navigateToSession(
    projectId: string,
    newTask: AliveClaudeCodeTask,
  ): void {
    const navigationEvent = {
      type: "navigate_to_session" as const,
      data: {
        projectId,
        sessionId: newTask.sessionId,
        userMessageId: newTask.userMessageId,
        reason: "auto_continue_success" as const,
      },
    };

    console.log(
      `[SessionContinuation] Emitting navigate_to_session event:`,
      navigationEvent,
    );
    this.eventBus.emit("navigate_to_session", navigationEvent);
  }

  private setFallbackNavigation(
    projectId: string,
    newTask: AliveClaudeCodeTask,
  ): void {
    setTimeout(() => {
      // Note: This would need access to alive tasks to check if still running
      // For now, emit fallback navigation regardless
      console.log(
        `[SessionContinuation] Navigation fallback: ensuring task ${newTask.id} is visible`,
      );

      this.eventBus.emit("navigate_to_session", {
        type: "navigate_to_session" as const,
        data: {
          projectId,
          sessionId: newTask.sessionId!,
          userMessageId: newTask.userMessageId!,
          reason: "auto_continue_success" as const,
        },
      });
    }, 5000); // 5 second fallback check
  }

  private handleContinuationFailure(currentTask: AliveClaudeCodeTask): void {
    this.eventBus.emit("navigate_to_project", {
      type: "navigate_to_project",
      data: {
        projectId: currentTask.projectId,
        taskId: currentTask.id,
        originalPrompt: currentTask.originalPrompt,
        reason: "auto_continue_failed",
        autoContinue: false,
      },
    });
  }
}
