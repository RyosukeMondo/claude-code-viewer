import type { ClaudeCodeState } from "./ClaudeCodeStateDetector";
import type { AliveClaudeCodeTask } from "./types";
import type { WorkflowStatus } from "./WorkflowCompletionDetector";

/**
 * Task action decisions based on Claude state + workflow status
 */
export type TaskAction = "continue" | "pause" | "complete" | "restart";

export interface TaskDecisionContext {
  claudeState: ClaudeCodeState;
  workflowStatus: WorkflowStatus;
  task: AliveClaudeCodeTask;
  canAutoContinue: boolean;
}

export interface TaskDecision {
  action: TaskAction;
  reason: string;
  shouldExecute: boolean;
}

/**
 * Orchestrates task decisions based on Claude state and workflow status.
 * Uses simple decision matrix for predictable behavior.
 */
export class TaskStateOrchestrator {
  /**
   * Decide what action to take based on current state
   */
  public decideTaskAction(context: TaskDecisionContext): TaskDecision {
    const { claudeState } = context;

    // Error state always completes task
    if (claudeState === "error") {
      return {
        action: "complete",
        reason: "Claude encountered an error",
        shouldExecute: true,
      };
    }

    // Running state continues (no decision needed)
    if (claudeState === "running") {
      return {
        action: "continue",
        reason: "Claude is actively processing",
        shouldExecute: false,
      };
    }

    // Idle state decisions based on workflow
    return this.decideIdleAction(context);
  }

  private decideIdleAction(context: TaskDecisionContext): TaskDecision {
    const { workflowStatus, canAutoContinue } = context;

    switch (workflowStatus) {
      case "completed":
        return {
          action: "complete",
          reason: "Spec-workflow completed successfully",
          shouldExecute: true,
        };

      case "in_progress":
        if (canAutoContinue) {
          return {
            action: "restart",
            reason: "Workflow incomplete, auto-continuing with new session",
            shouldExecute: true,
          };
        }
        return {
          action: "pause",
          reason: "Workflow incomplete, awaiting user input",
          shouldExecute: true,
        };

      case "no_activity":
        if (canAutoContinue) {
          return {
            action: "restart",
            reason: "No workflow activity, auto-continuing",
            shouldExecute: true,
          };
        }
        return {
          action: "pause",
          reason: "No workflow activity, awaiting user input",
          shouldExecute: true,
        };
      default:
        // For non-spec-workflow tasks or analysis failures
        return {
          action: "pause",
          reason: "Claude idle, awaiting user input",
          shouldExecute: true,
        };
    }
  }

  /**
   * Helper to determine if task can auto-continue
   */
  public canTaskAutoContinue(task: AliveClaudeCodeTask): boolean {
    return Boolean(task.autoContinue && task.originalPrompt);
  }
}
