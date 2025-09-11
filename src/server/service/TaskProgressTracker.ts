import type { z } from "zod";
import {
  type TaskProgressSchema,
  validateSpecWorkflowData,
  validateTaskProgress,
} from "../../lib/validation/taskSchemas";
import type { SpecWorkflowResult } from "./TaskMonitoringService";

/**
 * Task progress data structure
 */
export type TaskProgress = z.infer<typeof TaskProgressSchema>;

/**
 * Progress tracking error types
 */
export type TaskProgressError = {
  type: "validation" | "structure" | "parsing" | "relationship";
  message: string;
  details?: string;
  timestamp: Date;
  originalError?: unknown;
};

/**
 * Progress update result
 */
export type ProgressUpdateResult =
  | {
      success: true;
      data: TaskProgress;
    }
  | {
      success: false;
      error: TaskProgressError;
    };

/**
 * Progress validation result
 */
export type ProgressValidationResult =
  | {
      success: true;
      data: TaskProgress;
    }
  | {
      success: false;
      error: TaskProgressError;
    };

/**
 * Service for tracking task completion progress and validating data structures
 * with comprehensive error handling and spec-workflow structure validation.
 */
export class TaskProgressTracker {
  /**
   * Update task progress with new spec-workflow data
   * @param taskId - Task identifier
   * @param sessionId - Optional session identifier
   * @param specWorkflowResults - Array of spec-workflow tool results
   * @returns Progress update result with validation
   */
  public updateProgress(
    taskId: string,
    sessionId: string | undefined,
    specWorkflowResults: SpecWorkflowResult[],
  ): ProgressUpdateResult {
    try {
      // Validate spec-workflow results structure
      const validationResult =
        this.validateSpecWorkflowResults(specWorkflowResults);
      if (!validationResult.success) {
        return { success: false, error: validationResult.error };
      }

      // Get the latest result for current progress
      const latestResult = specWorkflowResults[specWorkflowResults.length - 1];
      if (!latestResult) {
        return {
          success: false,
          error: {
            type: "validation",
            message: "No spec-workflow results provided for progress update",
            details:
              "At least one spec-workflow tool result is required to track progress",
            timestamp: new Date(),
          },
        };
      }

      // Extract progress data from latest result
      const { data: toolData } = latestResult;
      const summary = toolData.data.summary;

      // Create progress object
      const progressData = {
        taskId,
        sessionId,
        totalTasks: summary.total,
        completedTasks: summary.completed,
        lastUpdated: latestResult.timestamp,
        toolResults: specWorkflowResults,
      };

      // Validate the constructed progress object
      const progressValidation = validateTaskProgress(progressData);
      if (!progressValidation.success) {
        return {
          success: false,
          error: {
            type: "validation",
            message: "Task progress data validation failed",
            details: progressValidation.error.message,
            timestamp: new Date(),
            originalError: progressValidation.error,
          },
        };
      }

      return { success: true, data: progressValidation.data };
    } catch (error) {
      return {
        success: false,
        error: {
          type: "parsing",
          message: "Unexpected error during progress update",
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          originalError: error,
        },
      };
    }
  }

  /**
   * Validate spec-workflow data structure with detailed error messages
   * @param specWorkflowResults - Array of spec-workflow results to validate
   * @returns Validation result with specific error guidance
   */
  private validateSpecWorkflowResults(
    specWorkflowResults: SpecWorkflowResult[],
  ): { success: true } | { success: false; error: TaskProgressError } {
    if (
      !Array.isArray(specWorkflowResults) ||
      specWorkflowResults.length === 0
    ) {
      return {
        success: false,
        error: {
          type: "validation",
          message: "Spec-workflow results must be a non-empty array",
          details: "Expected array of SpecWorkflowResult objects",
          timestamp: new Date(),
        },
      };
    }

    // Validate each result's data structure
    for (let i = 0; i < specWorkflowResults.length; i++) {
      const result = specWorkflowResults[i];

      // Validate the result has required structure
      if (!result?.data?.data) {
        return {
          success: false,
          error: {
            type: "structure",
            message: `Spec-workflow result ${i} missing required data structure`,
            details: "Expected result.data.data structure not found",
            timestamp: new Date(),
          },
        };
      }

      // Use the detailed validation from taskSchemas
      const dataValidation = validateSpecWorkflowData(result.data.data);
      if (!dataValidation.success) {
        // Return the specific error message from the validation function
        return {
          success: false,
          error: {
            type: "structure",
            message:
              dataValidation.error.message ||
              "Spec-workflow data validation failed",
            details: `Validation failed for result ${i}: ${dataValidation.error.message}`,
            timestamp: new Date(),
            originalError: dataValidation.error,
          },
        };
      }

      // Additional relationship validation
      const summary = result.data.data.summary;
      if (summary.completed > summary.total) {
        return {
          success: false,
          error: {
            type: "relationship",
            message: "Spec-workflow data contains invalid task counts",
            details: `Completed tasks (${summary.completed}) cannot exceed total tasks (${summary.total})`,
            timestamp: new Date(),
          },
        };
      }
    }

    return { success: true };
  }

  /**
   * Validate existing task progress data structure
   * @param progressData - Task progress data to validate
   * @returns Validation result with detailed error information
   */
  public validateProgressData(progressData: unknown): ProgressValidationResult {
    try {
      const validationResult = validateTaskProgress(progressData);

      if (!validationResult.success) {
        // Provide specific guidance for common validation failures
        const zodError = validationResult.error;
        let message = "Task progress validation failed";
        let details = zodError.message;

        // Check for specific validation issues and provide helpful messages
        for (const issue of zodError.issues) {
          if (
            issue.path.includes("taskId") &&
            (issue.code === "invalid_type" || issue.code === "custom")
          ) {
            message = "Task progress contains invalid task ID";
            details = "Task ID must be a valid UUID string";
            break;
          }

          if (
            issue.path.includes("totalTasks") ||
            issue.path.includes("completedTasks")
          ) {
            message = "Task progress contains invalid task counts";
            details = "Task counts must be non-negative integers";
            break;
          }

          if (issue.path.includes("toolResults")) {
            message = "Task progress contains invalid tool results";
            details =
              "Tool results must be an array of valid SpecWorkflowResult objects";
            break;
          }
        }

        return {
          success: false,
          error: {
            type: "validation",
            message,
            details,
            timestamp: new Date(),
            originalError: zodError,
          },
        };
      }

      return { success: true, data: validationResult.data };
    } catch (error) {
      return {
        success: false,
        error: {
          type: "parsing",
          message: "Unexpected error during progress validation",
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          originalError: error,
        },
      };
    }
  }

  /**
   * Check if all tasks are completed based on progress data
   * @param progress - Current task progress
   * @returns True if all tasks are completed (total > 0 and total === completed)
   */
  public isAllTasksCompleted(progress: TaskProgress): boolean {
    return (
      progress.totalTasks > 0 && progress.totalTasks === progress.completedTasks
    );
  }

  /**
   * Calculate completion percentage
   * @param progress - Current task progress
   * @returns Completion percentage (0-100)
   */
  public getCompletionPercentage(progress: TaskProgress): number {
    if (progress.totalTasks === 0) return 0;
    return Math.round((progress.completedTasks / progress.totalTasks) * 100);
  }

  /**
   * Get remaining task count
   * @param progress - Current task progress
   * @returns Number of remaining tasks
   */
  public getRemainingTaskCount(progress: TaskProgress): number {
    return Math.max(0, progress.totalTasks - progress.completedTasks);
  }

  /**
   * Compare two progress states to detect changes
   * @param previousProgress - Previous progress state
   * @param currentProgress - Current progress state
   * @returns True if progress has changed (completed tasks increased)
   */
  public hasProgressChanged(
    previousProgress: TaskProgress | null,
    currentProgress: TaskProgress,
  ): boolean {
    if (!previousProgress) return true;

    return (
      currentProgress.completedTasks > previousProgress.completedTasks ||
      currentProgress.totalTasks !== previousProgress.totalTasks
    );
  }

  /**
   * Create progress summary for display
   * @param progress - Current task progress
   * @returns Human-readable progress summary
   */
  public createProgressSummary(progress: TaskProgress): {
    status: string;
    percentage: number;
    remaining: number;
    isComplete: boolean;
    lastUpdated: string;
  } {
    const percentage = this.getCompletionPercentage(progress);
    const remaining = this.getRemainingTaskCount(progress);
    const isComplete = this.isAllTasksCompleted(progress);

    let status: string;
    if (isComplete) {
      status = "All tasks completed";
    } else if (progress.completedTasks === 0) {
      status = "No tasks completed yet";
    } else {
      status = `${progress.completedTasks} of ${progress.totalTasks} tasks completed`;
    }

    return {
      status,
      percentage,
      remaining,
      isComplete,
      lastUpdated: progress.lastUpdated.toISOString(),
    };
  }
}

// Export singleton instance
export const taskProgressTracker = new TaskProgressTracker();
