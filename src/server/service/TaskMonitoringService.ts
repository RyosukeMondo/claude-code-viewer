import { z } from "zod";
import type { Conversation } from "../../lib/conversation-schema";
import type { ErrorJsonl, SessionDetail } from "./types";

// Zod schema for spec-workflow tool result validation
const SpecWorkflowSummarySchema = z.object({
  total: z.number(),
  completed: z.number(),
  inProgress: z.number().optional(),
  pending: z.number().optional(),
});

const SpecWorkflowDataSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    summary: SpecWorkflowSummarySchema,
  }),
});

const SpecWorkflowResultSchema = z.object({
  toolName: z.literal("mcp__spec-workflow__manage-tasks"),
  timestamp: z.date(),
  data: SpecWorkflowDataSchema,
});

export type SpecWorkflowResult = z.infer<typeof SpecWorkflowResultSchema>;

export type TaskProgress = {
  taskId: string;
  sessionId?: string;
  totalTasks: number;
  completedTasks: number;
  lastUpdated: Date;
  toolResults: SpecWorkflowResult[];
};

export type TaskMonitoringError = {
  type: "validation" | "parsing" | "structure";
  message: string;
  details?: string;
  timestamp: Date;
};

/**
 * Service for monitoring Claude Code conversations for spec-workflow tool usage
 * and extracting task progress information.
 */
export class TaskMonitoringService {
  /**
   * Monitor a conversation session for spec-workflow tool usage
   * @param session - Session detail containing conversations
   * @param taskId - Associated task ID for progress tracking
   * @returns Task progress data or null if no spec-workflow usage found
   */
  public monitorSession(
    session: SessionDetail,
    taskId: string,
  ): TaskProgress | null {
    const toolResults = this.extractSpecWorkflowResults(session.conversations);

    if (toolResults.length === 0) {
      return null;
    }

    // Get the latest tool result for current progress
    const latestResult = toolResults[toolResults.length - 1];
    if (!latestResult) {
      return null;
    }

    return {
      taskId,
      sessionId: session.id,
      totalTasks: latestResult.data.data.summary.total,
      completedTasks: latestResult.data.data.summary.completed,
      lastUpdated: latestResult.timestamp,
      toolResults,
    };
  }

  /**
   * Extract spec-workflow tool results from conversation entries
   * @param conversations - Array of conversation entries (including error entries)
   * @returns Array of validated spec-workflow results
   */
  public extractSpecWorkflowResults(
    conversations: (Conversation | ErrorJsonl)[],
  ): SpecWorkflowResult[] {
    const results: SpecWorkflowResult[] = [];

    for (const conversation of conversations) {
      // Skip error entries
      if (conversation.type === "x-error") {
        continue;
      }

      if (conversation.type === "assistant") {
        // Check for tool use and tool result pairs
        const toolUsages = this.findSpecWorkflowToolUsage(conversation);

        for (const { toolResult } of toolUsages) {
          try {
            const parsedResult = this.parseToolResult(
              toolResult.content,
              conversation.timestamp,
            );
            if (parsedResult) {
              results.push(parsedResult);
            }
          } catch (error) {
            console.warn("Failed to parse spec-workflow tool result:", error);
          }
        }
      }
    }

    return results.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }

  /**
   * Find spec-workflow tool usage pairs (tool_use + tool_result) in assistant message
   */
  private findSpecWorkflowToolUsage(
    conversation: any,
  ): Array<{ toolUse: any; toolResult: any }> {
    const pairs: Array<{ toolUse: any; toolResult: any }> = [];

    if (
      !conversation.message?.content ||
      !Array.isArray(conversation.message.content)
    ) {
      return pairs;
    }

    const content = conversation.message.content;

    // Find tool_use entries for spec-workflow tools
    const specWorkflowToolUses = content.filter(
      (item: any) =>
        item.type === "tool_use" &&
        item.name?.startsWith("mcp__spec-workflow__"),
    );

    // Find corresponding tool_result entries
    for (const toolUse of specWorkflowToolUses) {
      const toolResult = content.find(
        (item: any) =>
          item.type === "tool_result" && item.tool_use_id === toolUse.id,
      );

      if (toolResult) {
        pairs.push({ toolUse, toolResult });
      }
    }

    return pairs;
  }

  /**
   * Parse tool result content and validate against spec-workflow schema
   * @param content - Tool result content (string or array)
   * @param timestamp - Timestamp from conversation entry
   * @returns Parsed and validated spec-workflow result
   */
  public parseToolResult(
    content: string | any[],
    timestamp?: string,
  ): SpecWorkflowResult | null {
    let jsonContent: string;

    // Handle different content formats
    if (typeof content === "string") {
      jsonContent = content;
    } else if (Array.isArray(content)) {
      const textContent = content.find((item) => item.type === "text");
      jsonContent = textContent?.text || "";
    } else {
      return null;
    }

    try {
      // Parse JSON content
      const parsedData = JSON.parse(jsonContent);

      // Validate against spec-workflow data structure
      const validatedData = SpecWorkflowDataSchema.parse(parsedData);

      return {
        toolName: "mcp__spec-workflow__manage-tasks",
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        data: validatedData,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw this.createStructureError(error);
      }
      throw new Error(`Failed to parse tool result JSON: ${error}`);
    }
  }

  /**
   * Validate task progress data structure and throw descriptive errors
   * @param progress - Task progress data to validate
   * @throws TaskMonitoringError with specific guidance
   */
  public validateProgressStructure(progress: any): TaskProgress {
    try {
      // Validate the progress object structure
      if (!progress || typeof progress !== "object") {
        throw new Error("Task progress data is missing or invalid");
      }

      if (
        typeof progress.totalTasks !== "number" ||
        typeof progress.completedTasks !== "number"
      ) {
        throw new Error(
          "Task progress must contain totalTasks and completedTasks as numbers",
        );
      }

      return progress as TaskProgress;
    } catch (error) {
      throw {
        type: "validation" as const,
        message: "Task progress validation failed",
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      } as TaskMonitoringError;
    }
  }

  /**
   * Create descriptive error for spec-workflow data structure changes
   */
  private createStructureError(zodError: z.ZodError): TaskMonitoringError {
    const issues = zodError.issues;

    // Check for missing summary object
    const summaryMissing = issues.some(
      (issue) =>
        issue.path.includes("summary") && issue.code === "invalid_type",
    );

    if (summaryMissing) {
      return {
        type: "structure",
        message:
          "Spec-workflow data structure missing 'summary'. Check spec-workflow system for changes.",
        details:
          "The expected data.summary object is not present in the tool result",
        timestamp: new Date(),
      };
    }

    // Check for missing total/completed properties
    const totalMissing = issues.some(
      (issue) => issue.path.includes("total") && issue.code === "invalid_type",
    );
    const completedMissing = issues.some(
      (issue) =>
        issue.path.includes("completed") && issue.code === "invalid_type",
    );

    if (totalMissing || completedMissing) {
      return {
        type: "structure",
        message:
          "Spec-workflow summary structure changed. Expected 'total' and 'completed' properties. Check spec-workflow specification for updates.",
        details:
          `Missing properties: ${totalMissing ? "total" : ""} ${completedMissing ? "completed" : ""}`.trim(),
        timestamp: new Date(),
      };
    }

    // Generic structure error
    return {
      type: "structure",
      message:
        "Spec-workflow data structure validation failed. Check spec-workflow specification for structural changes.",
      details: zodError.message,
      timestamp: new Date(),
    };
  }

  /**
   * Check if all tasks are completed based on progress data
   * @param progress - Current task progress
   * @returns True if all tasks are completed
   */
  public isAllTasksCompleted(progress: TaskProgress): boolean {
    return (
      progress.totalTasks > 0 && progress.totalTasks === progress.completedTasks
    );
  }

  /**
   * Get completion percentage
   * @param progress - Current task progress
   * @returns Completion percentage (0-100)
   */
  public getCompletionPercentage(progress: TaskProgress): number {
    if (progress.totalTasks === 0) return 0;
    return Math.round((progress.completedTasks / progress.totalTasks) * 100);
  }
}

// Export singleton instance
export const taskMonitoringService = new TaskMonitoringService();
