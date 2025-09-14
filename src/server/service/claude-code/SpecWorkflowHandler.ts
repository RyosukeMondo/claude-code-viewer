import { taskMonitoringService } from "../TaskMonitoringService";
import type { SessionContinuationHandler } from "./SessionContinuationHandler";
import type { AliveClaudeCodeTask, TaskSessionConfig } from "./types";

/**
 * Handles spec-workflow completion detection and task continuation logic.
 * Responsible for monitoring spec-workflow progress and determining next actions.
 */
export class SpecWorkflowHandler {
  private continuationHandler: SessionContinuationHandler;

  constructor(continuationHandler: SessionContinuationHandler) {
    this.continuationHandler = continuationHandler;
  }

  /**
   * Handles spec-workflow completion detection for a task
   */
  public async handleCompletion(
    currentTask: AliveClaudeCodeTask,
    startTask: (
      config: TaskSessionConfig,
      message: string,
    ) => Promise<AliveClaudeCodeTask>,
    completeTask: (taskId: string) => void,
    pauseTask: (taskId: string) => void,
  ): Promise<void> {
    try {
      if (!currentTask.sessionId) {
        console.log(
          `[SpecWorkflowHandler] No session ID for task ${currentTask.id}, completing task`,
        );
        completeTask(currentTask.id);
        return;
      }

      const taskProgress = await this.getTaskProgress(currentTask);

      if (taskProgress && this.isWorkflowCompleted(taskProgress)) {
        await this.handleWorkflowCompleted(currentTask, completeTask);
      } else if (taskProgress) {
        await this.handleWorkflowIncomplete(
          currentTask,
          startTask,
          completeTask,
          pauseTask,
        );
      } else {
        await this.handleNoWorkflowActivity(
          currentTask,
          startTask,
          completeTask,
          pauseTask,
        );
      }
    } catch (error) {
      console.error(`[SpecWorkflowHandler] Error handling completion:`, error);
      completeTask(currentTask.id); // Fail safe - complete the task
    }
  }

  private async getTaskProgress(currentTask: AliveClaudeCodeTask) {
    const { getSession } = await import("../session/getSession");
    const { session } = await getSession(
      currentTask.projectId,
      currentTask.sessionId!,
    );
    return taskMonitoringService.monitorSession(session, currentTask.id);
  }

  private isWorkflowCompleted(taskProgress: any): boolean {
    return taskMonitoringService.isAllTasksCompleted(taskProgress);
  }

  private async handleWorkflowCompleted(
    currentTask: AliveClaudeCodeTask,
    completeTask: (taskId: string) => void,
  ): Promise<void> {
    console.log(
      `[SpecWorkflowHandler] Spec-workflow completed! Task ${currentTask.id} accomplished. Stopping task.`,
    );
    completeTask(currentTask.id);
  }

  private async handleWorkflowIncomplete(
    currentTask: AliveClaudeCodeTask,
    startTask: (
      config: TaskSessionConfig,
      message: string,
    ) => Promise<AliveClaudeCodeTask>,
    completeTask: (taskId: string) => void,
    pauseTask: (taskId: string) => void,
  ): Promise<void> {
    console.log(
      `[SpecWorkflowHandler] Spec-workflow incomplete. Auto-continue: ${currentTask.autoContinue}`,
    );

    if (this.canAutoContinue(currentTask)) {
      await this.continuationHandler.handleAutoContinue(
        currentTask,
        startTask,
        completeTask,
        "spec_workflow_incomplete",
      );
    } else {
      this.continuationHandler.handleManualContinuation(
        currentTask,
        "spec_workflow_incomplete",
      );
      pauseTask(currentTask.id);
    }
  }

  private async handleNoWorkflowActivity(
    currentTask: AliveClaudeCodeTask,
    startTask: (
      config: TaskSessionConfig,
      message: string,
    ) => Promise<AliveClaudeCodeTask>,
    completeTask: (taskId: string) => void,
    pauseTask: (taskId: string) => void,
  ): Promise<void> {
    console.log(
      `[SpecWorkflowHandler] No spec-workflow activity detected for task ${currentTask.id} - auto-continuing to next session`,
    );

    if (this.canAutoContinue(currentTask)) {
      await this.continuationHandler.handleAutoContinue(
        currentTask,
        startTask,
        completeTask,
        "no_spec_workflow_activity",
      );
    } else {
      this.continuationHandler.handleManualContinuation(
        currentTask,
        "spec_workflow_no_activity",
      );
      pauseTask(currentTask.id);
    }
  }

  private canAutoContinue(currentTask: AliveClaudeCodeTask): boolean {
    return Boolean(currentTask.autoContinue && currentTask.originalPrompt);
  }
}
