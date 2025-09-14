import type { AliveTask } from "../core/task-types";
import type { ClaudeState } from "../detection/StateDetector";
import type { WorkflowStatus } from "../WorkflowCompletionDetector";

/**
 * Task action types
 */
export type TaskAction = "continue" | "pause" | "complete" | "restart";

/**
 * Decision context for task actions
 */
export interface DecisionContext {
  readonly claudeState: ClaudeState;
  readonly workflowStatus: WorkflowStatus;
  readonly task: AliveTask;
  readonly canAutoContinue: boolean;
}

/**
 * Decision result
 */
export interface TaskDecision {
  readonly action: TaskAction;
  readonly reason: string;
  readonly shouldExecute: boolean;
}

/**
 * Simplified decision engine using lookup table approach (KISS principle)
 */
export class DecisionEngine {
  /**
   * Decide task action using simple rule-based logic
   */
  decideAction(context: DecisionContext): TaskDecision {
    const { claudeState, workflowStatus, canAutoContinue } = context;

    // Simple priority-based decision table
    const DecisionTable = {
      error: () =>
        this.createDecision("complete", "Claude encountered an error", true),

      running: () =>
        this.createDecision("continue", "Claude is actively processing", false),

      idle: () => this.decideIdleAction(workflowStatus, canAutoContinue),
    };

    const decisionFn = DecisionTable[claudeState];
    return decisionFn
      ? decisionFn()
      : this.createDecision("pause", "Unknown state", true);
  }

  /**
   * Check if task can auto-continue
   */
  canTaskAutoContinue(task: AliveTask): boolean {
    return Boolean(task.autoContinue && task.originalPrompt);
  }

  private decideIdleAction(
    workflowStatus: WorkflowStatus,
    canAutoContinue: boolean,
  ): TaskDecision {
    const IdleDecisions = {
      completed: () =>
        this.createDecision(
          "complete",
          "Spec-workflow completed successfully",
          true,
        ),

      in_progress: () =>
        canAutoContinue
          ? this.createDecision(
              "restart",
              "Workflow incomplete, auto-continuing",
              true,
            )
          : this.createDecision(
              "pause",
              "Workflow incomplete, awaiting user input",
              true,
            ),

      no_activity: () =>
        canAutoContinue
          ? this.createDecision(
              "restart",
              "No workflow activity, auto-continuing",
              true,
            )
          : this.createDecision(
              "pause",
              "No workflow activity, awaiting user input",
              true,
            ),
    };

    const decisionFn = IdleDecisions[workflowStatus];
    return decisionFn
      ? decisionFn()
      : this.createDecision("pause", "Claude idle, awaiting user input", true);
  }

  private createDecision(
    action: TaskAction,
    reason: string,
    shouldExecute: boolean,
  ): TaskDecision {
    return { action, reason, shouldExecute };
  }
}
