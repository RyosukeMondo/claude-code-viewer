/**
 * Simplified Claude Code state detection following KISS principles.
 * Single responsibility: Determine Claude's execution state.
 */

export type ClaudeState = "running" | "idle" | "error";

export interface StateContext {
  readonly message: ClaudeCodeMessage | null;
  readonly isLastMessage: boolean;
  readonly lastActivity?: number;
}

export interface ClaudeCodeMessage {
  readonly type: string;
  readonly uuid?: string;
  readonly session_id?: string;
  readonly content?: unknown;
  readonly error?: string;
}

/**
 * Pure state detection with simplified rule-based logic.
 * No side effects, just analysis.
 */
export class StateDetector {
  private readonly TIMEOUT_MS = 120_000; // 2 minutes

  /**
   * Detect Claude's current state using simple rule priority
   */
  detectState(context: StateContext): ClaudeState {
    // Priority 1: Error conditions
    if (this.hasError(context.message)) {
      return "error";
    }

    // Priority 2: Timeout conditions
    if (this.hasTimedOut(context.lastActivity)) {
      return "idle";
    }

    // Priority 3: Activity-based detection
    return this.detectActivity(context);
  }

  private hasError(message: ClaudeCodeMessage | null): boolean {
    if (!message) return false;
    return Boolean(
      message.type === "error" ||
        message.error ||
        (message.type === "system" &&
          typeof message.content === "string" &&
          message.content.includes("error")),
    );
  }

  private hasTimedOut(lastActivity?: number): boolean {
    if (!lastActivity) return false;
    return Date.now() - lastActivity > this.TIMEOUT_MS;
  }

  private detectActivity(context: StateContext): ClaudeState {
    const { message, isLastMessage } = context;
    const messageType = message?.type;

    // Simple activity rules - much cleaner than nested conditionals
    const ActivityRules = {
      // Tool usage always indicates active processing
      isToolActivity: () =>
        messageType ? ["tool_use", "tool_result"].includes(messageType) : false,

      // Last assistant message means Claude finished (idle)
      isFinishedResponse: () => isLastMessage && messageType === "assistant",

      // Non-last messages indicate ongoing activity
      isOngoingActivity: () =>
        !isLastMessage && messageType
          ? ["user", "assistant"].includes(messageType)
          : false,
    };

    if (ActivityRules.isToolActivity()) return "running";
    if (ActivityRules.isFinishedResponse()) return "idle";
    if (ActivityRules.isOngoingActivity()) return "running";

    return "idle";
  }
}
