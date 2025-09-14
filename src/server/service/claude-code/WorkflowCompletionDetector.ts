import { taskMonitoringService } from "../TaskMonitoringService";
import type { AliveClaudeCodeTask } from "./types";

/**
 * Detects spec-workflow completion status.
 * Single responsibility: Analyze workflow progress and completion.
 */
export type WorkflowStatus =
  | "completed"
  | "in_progress"
  | "no_activity"
  | "unknown";

export interface WorkflowContext {
  task: AliveClaudeCodeTask;
  claudeState: "running" | "idle" | "error";
}

/**
 * Pure workflow analysis - delegates to existing monitoring service
 */
export class WorkflowCompletionDetector {
  /**
   * Detect current workflow completion status
   */
  public async detectWorkflowStatus(
    context: WorkflowContext,
  ): Promise<WorkflowStatus> {
    // Only analyze workflows for spec-workflow tasks
    if (context.task.completionCondition !== "spec-workflow") {
      return "unknown";
    }

    try {
      const taskProgress = await this.getTaskProgress(context.task);

      if (!taskProgress) {
        return "no_activity";
      }

      if (this.isWorkflowCompleted(taskProgress)) {
        return "completed";
      }

      return "in_progress";
    } catch (error) {
      console.error(`[WorkflowDetector] Error analyzing workflow:`, error);
      return "unknown";
    }
  }

  private async getTaskProgress(task: AliveClaudeCodeTask) {
    const { getSession } = await import("../session/getSession");
    const { session } = await getSession(task.projectId, task.sessionId ?? "");
    return taskMonitoringService.monitorSession(session, task.id);
  }

  private isWorkflowCompleted(taskProgress: unknown): boolean {
    return taskMonitoringService.isAllTasksCompleted(taskProgress);
  }
}
