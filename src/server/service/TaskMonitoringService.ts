import { z } from "zod";
import type { Conversation } from "../../lib/conversation-schema";
import type { ErrorJsonl, SessionDetail } from "./types";

// Zod schemas for spec-workflow tool result validation
const SpecWorkflowSummarySchema = z.object({
  total: z.number(),
  completed: z.number(),
  inProgress: z.number().optional(),
  pending: z.number().optional(),
});

// Schema for responses with summary data (from spec-status actions)
const SpecWorkflowSummaryDataSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    summary: SpecWorkflowSummarySchema,
  }),
});

// Flexible schema for any spec-workflow response
const SpecWorkflowBaseDataSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.record(z.string(), z.any()).optional(), // Allow any data structure or undefined
});

const SpecWorkflowResultSchema = z.object({
  toolName: z.literal("mcp__spec-workflow__manage-tasks"),
  timestamp: z.date(),
  data: SpecWorkflowSummaryDataSchema,
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

    // Build a map of tool_use_id to tool_use for spec-workflow tools
    const specWorkflowToolUses = new Map<string, any>();

    for (const conversation of conversations) {
      // Skip error entries
      if (conversation.type === "x-error") {
        continue;
      }

      // Collect tool_use entries from assistant messages
      if (
        conversation.type === "assistant" &&
        conversation.message?.content &&
        Array.isArray(conversation.message.content)
      ) {
        for (const item of conversation.message.content) {
          if (
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            item.type === "tool_use" &&
            "name" in item &&
            item.name?.startsWith("mcp__spec-workflow__") &&
            "id" in item &&
            item.id
          ) {
            specWorkflowToolUses.set(item.id, {
              toolUse: item,
              timestamp: conversation.timestamp,
            });
          }
        }
      }

      // Look for tool_result entries in user messages
      if (
        conversation.type === "user" &&
        conversation.message?.content &&
        Array.isArray(conversation.message.content)
      ) {
        for (const item of conversation.message.content) {
          if (
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            item.type === "tool_result" &&
            "tool_use_id" in item &&
            item.tool_use_id &&
            specWorkflowToolUses.has(item.tool_use_id)
          ) {
            try {
              const toolUseInfo = specWorkflowToolUses.get(item.tool_use_id);
              const parsedResult = this.parseToolResult(
                item.content,
                toolUseInfo.timestamp,
              );
              if (parsedResult) {
                results.push(parsedResult);
                console.log(
                  `[TaskMonitoringService] Successfully parsed spec-workflow summary data`,
                );
              }
            } catch (error) {
              // This should no longer happen with graceful parsing, but keep for safety
              console.warn(
                "[TaskMonitoringService] Unexpected error parsing spec-workflow tool result:",
                error,
              );
            }
          }
        }
      }
    }

    return results.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }

  /**
   * Parse tool result content and validate against spec-workflow schema
   * @param content - Tool result content (string or array)
   * @param timestamp - Timestamp from conversation entry
   * @returns Parsed and validated spec-workflow result, or null if not summary data
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
      console.log(
        "[TaskMonitoringService] Skipping non-string tool result content",
      );
      return null;
    }

    try {
      // Parse JSON content
      const parsedData = JSON.parse(jsonContent);

      // First, check if this is a basic spec-workflow response
      const baseValidation = SpecWorkflowBaseDataSchema.safeParse(parsedData);
      if (!baseValidation.success) {
        console.log(
          "[TaskMonitoringService] Tool result is not a valid spec-workflow response, skipping",
        );
        return null;
      }

      // Check if this response contains summary data (what we need for monitoring)
      const summaryValidation =
        SpecWorkflowSummaryDataSchema.safeParse(parsedData);
      if (!summaryValidation.success) {
        // This is a valid spec-workflow response but doesn't contain summary data
        // (probably from next-pending, set-status, etc.) - skip silently
        console.log(
          `[TaskMonitoringService] Spec-workflow response does not contain summary data (action likely: ${this.inferActionFromData(parsedData)}), skipping`,
        );
        return null;
      }

      // Successfully parsed summary data
      return {
        toolName: "mcp__spec-workflow__manage-tasks",
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        data: summaryValidation.data,
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn(
          "[TaskMonitoringService] Failed to parse JSON in tool result:",
          error.message,
        );
        return null;
      }
      console.warn(
        "[TaskMonitoringService] Failed to parse spec-workflow tool result:",
        error,
      );
      return null;
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
   * Infer the action type from spec-workflow response data
   * @param data - Parsed response data
   * @returns Likely action name
   */
  private inferActionFromData(data: unknown): string {
    if (typeof data === "object" && data !== null) {
      const dataObj = data as Record<string, unknown>;
      const dataField = dataObj["data"] as Record<string, unknown> | undefined;

      if (dataField?.["nextTask"]) return "next-pending";
      if (dataField?.["taskId"] && dataField?.["previousStatus"]) return "set-status";
      if (dataField?.["summary"]) return "spec-status";
    }
    return "unknown";
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
