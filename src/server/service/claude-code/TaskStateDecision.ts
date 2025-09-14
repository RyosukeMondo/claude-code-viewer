/**
 * Explicit contract for task state decisions.
 * Prevents ambiguity about what happened during message processing.
 */
export interface TaskStateDecision {
  /** What action should be taken with the task */
  action: "continue" | "pause" | "complete";
  /** Why this decision was made */
  reason: string;
  /** Was the decision already executed? */
  wasExecuted: boolean;
}

/**
 * Context information needed to make task state decisions
 */
interface TaskDecisionContext {
  message: any;
  currentTask?: any;
  isLastMessage: boolean;
  messageType?: string;
}

/**
 * Centralized task state decision logic.
 * Single responsibility: Decide what should happen to a task.
 * Does NOT execute the decision - only makes the determination.
 */
export class TaskStateDecisionEngine {
  /**
   * Analyze message and determine what should happen to the task
   */
  public decideTaskAction(context: TaskDecisionContext): TaskStateDecision {
    // Handle result messages during the stream
    if (context.message.type === "result" && context.currentTask) {
      return this.handleResultMessage(context);
    }

    // Handle stream ending scenarios
    if (context.isLastMessage && context.currentTask) {
      return this.handleStreamEnd(context);
    }

    // Continue processing
    return {
      action: "continue",
      reason: "Processing message",
      wasExecuted: false,
    };
  }

  private handleResultMessage(context: TaskDecisionContext): TaskStateDecision {
    const task = context.currentTask!;

    if (task.completionCondition === "spec-workflow") {
      // Decision will be made by SpecWorkflowHandler
      return {
        action: "continue", // Let spec-workflow handler decide
        reason: "Spec-workflow will determine next action",
        wasExecuted: false,
      };
    } else {
      // Default tasks pause for user input
      return {
        action: "pause",
        reason: "Default task completed, awaiting user input",
        wasExecuted: false,
      };
    }
  }

  private handleStreamEnd(context: TaskDecisionContext): TaskStateDecision {
    // Stream ended without a result message = Claude waiting for input
    if (context.message?.type !== "result") {
      return {
        action: "pause",
        reason: "Stream ended without result, Claude awaiting input",
        wasExecuted: false,
      };
    }

    // Stream ended after result = decision should have been made already
    return {
      action: "continue",
      reason: "Stream ended after result, no action needed",
      wasExecuted: false,
    };
  }
}
