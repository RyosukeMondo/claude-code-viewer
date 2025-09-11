import { z } from "zod";

/**
 * Task validation schemas for runtime validation of task configuration
 * and spec-workflow data structure with clear error messages.
 */

/**
 * Task status validation schema
 */
export const TaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "cancelled",
  "error",
]);

/**
 * Completion condition validation schema
 */
export const CompletionConditionSchema = z.enum(["spec-workflow"]);

/**
 * Task configuration validation schema
 */
export const TaskConfigSchema = z.object({
  id: z.string().uuid("Task ID must be a valid UUID"),
  projectId: z.string().min(1, "Project ID cannot be empty"),
  prompt: z
    .string()
    .min(1, "Prompt text cannot be empty")
    .max(10000, "Prompt text cannot exceed 10,000 characters"),
  completionCondition: CompletionConditionSchema,
  createdAt: z.date(),
  status: TaskStatusSchema,
});

/**
 * Spec-workflow summary structure validation with detailed error messages
 */
export const SpecWorkflowSummarySchema = z.object({
  total: z.number().int().min(0, "Total tasks must be a non-negative integer"),
  completed: z
    .number()
    .int()
    .min(0, "Completed tasks must be a non-negative integer"),
  inProgress: z
    .number()
    .int()
    .min(0, "In-progress tasks must be a non-negative integer"),
  pending: z
    .number()
    .int()
    .min(0, "Pending tasks must be a non-negative integer"),
});

/**
 * Spec-workflow data structure validation
 */
export const SpecWorkflowDataSchema = z.object({
  summary: SpecWorkflowSummarySchema,
});

/**
 * Spec-workflow tool result validation schema
 */
export const SpecWorkflowResultSchema = z.object({
  toolName: z.literal("mcp__spec-workflow__manage-tasks"),
  timestamp: z.date(),
  data: z.object({
    success: z.boolean(),
    message: z.string(),
    data: SpecWorkflowDataSchema,
  }),
});

/**
 * Task progress validation schema
 */
export const TaskProgressSchema = z
  .object({
    taskId: z.string().uuid("Task ID must be a valid UUID"),
    sessionId: z.string().optional(),
    totalTasks: z
      .number()
      .int()
      .min(0, "Total tasks must be a non-negative integer"),
    completedTasks: z
      .number()
      .int()
      .min(0, "Completed tasks must be a non-negative integer"),
    lastUpdated: z.date(),
    toolResults: z.array(SpecWorkflowResultSchema),
  })
  .refine((data) => data.completedTasks <= data.totalTasks, {
    message: "Completed tasks cannot exceed total tasks",
    path: ["completedTasks"],
  });

/**
 * Create task request validation schema
 */
export const CreateTaskRequestSchema = z.object({
  projectId: z.string().min(1, "Project ID cannot be empty"),
  prompt: z
    .string()
    .min(1, "Prompt text cannot be empty")
    .max(10000, "Prompt text cannot exceed 10,000 characters"),
  completionCondition: CompletionConditionSchema,
});

/**
 * Task status update validation schema
 */
export const TaskStatusUpdateSchema = z.object({
  taskId: z.string().uuid("Task ID must be a valid UUID"),
  status: TaskStatusSchema,
  sessionId: z.string().optional(),
  progress: TaskProgressSchema.partial().optional(),
});

/**
 * Validation helper functions
 */

/**
 * Validates spec-workflow data structure and provides detailed error messages
 */
export function validateSpecWorkflowData(data: unknown) {
  const result = SpecWorkflowDataSchema.safeParse(data);

  if (!result.success) {
    // Add custom error message for missing summary
    const hasNoSummary =
      !data || typeof data !== "object" || !("summary" in data);
    if (hasNoSummary) {
      return {
        success: false as const,
        error: {
          ...result.error,
          message:
            "Spec-workflow data structure missing 'summary'. Check spec-workflow system for changes.",
        },
      };
    }

    // Add custom error for missing summary properties
    const summaryData = (data as Record<string, unknown>).summary;
    if (summaryData && typeof summaryData === "object") {
      const requiredProps = ["total", "completed", "inProgress", "pending"];
      const missingProps = requiredProps.filter(
        (prop) => !(prop in summaryData),
      );
      if (missingProps.length > 0) {
        return {
          success: false as const,
          error: {
            ...result.error,
            message: `Spec-workflow summary structure changed. Expected '${requiredProps.join("', '")}' properties. Check spec-workflow specification for updates.`,
          },
        };
      }
    }
  }

  return result;
}

/**
 * Validates task configuration with comprehensive error handling
 */
export function validateTaskConfig(data: unknown) {
  return TaskConfigSchema.safeParse(data);
}

/**
 * Validates task progress with relationship constraints
 */
export function validateTaskProgress(data: unknown) {
  return TaskProgressSchema.safeParse(data);
}
