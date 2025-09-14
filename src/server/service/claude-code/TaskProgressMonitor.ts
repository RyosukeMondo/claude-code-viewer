import {
  type TaskProgress,
  taskMonitoringService,
} from "../TaskMonitoringService";
import type { SessionDetail } from "../types";

/**
 * Dedicated service for monitoring task progress.
 *
 * PRINCIPLES APPLIED:
 * - SRP: Single responsibility - only monitors progress, doesn't handle automation logic
 * - SLAP: Single level of abstraction - high-level progress monitoring operations
 * - KISS: Simple, focused interface without complex state management
 */
export class TaskProgressMonitor {
  /**
   * Monitor progress for a specific task session.
   * Returns null if no progress data is available yet.
   */
  async monitorTaskProgress(
    projectId: string,
    sessionId: string,
    taskId: string,
  ): Promise<TaskProgress | null> {
    try {
      const sessionDetail = await this.getSessionDetail(projectId, sessionId);

      if (!sessionDetail) {
        return null;
      }

      return taskMonitoringService.monitorSession(sessionDetail, taskId);
    } catch (error) {
      console.error(
        `[TaskProgressMonitor] Error monitoring task ${taskId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Check if task progress indicates completion.
   */
  isTaskComplete(progress: TaskProgress | null): boolean {
    if (!progress) {
      return false;
    }

    return taskMonitoringService.isAllTasksCompleted(progress);
  }

  /**
   * Get progress percentage for display.
   */
  getProgressPercentage(progress: TaskProgress | null): number {
    if (!progress) {
      return 0;
    }

    return taskMonitoringService.getCompletionPercentage(progress);
  }

  /**
   * Private helper to get session details.
   * In a real implementation, this would call the session service.
   */
  private async getSessionDetail(
    projectId: string,
    sessionId: string,
  ): Promise<SessionDetail | null> {
    try {
      const { getSession } = await import("../session/getSession");
      const { session } = await getSession(projectId, sessionId);
      return session;
    } catch (error) {
      console.error(
        `[TaskProgressMonitor] Failed to get session ${sessionId}:`,
        error,
      );
      return null;
    }
  }
}

// Export singleton instance for consistency
export const taskProgressMonitor = new TaskProgressMonitor();
