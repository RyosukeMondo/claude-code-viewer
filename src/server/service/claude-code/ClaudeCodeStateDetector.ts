/**
 * Detects Claude Code's current execution state.
 * Single responsibility: Determine if Claude is running, idle, or errored.
 */
export type ClaudeCodeState = "running" | "idle" | "error";

export interface ClaudeStateContext {
  lastMessage: any;
  isStreamActive: boolean;
  isLastMessage: boolean;
  messageType?: string;
  lastActivity?: number; // timestamp of last activity
}

/**
 * Pure state detection - no side effects, just analysis
 */
export class ClaudeCodeStateDetector {
  /**
   * Detect Claude Code's current state based on message stream context
   */
  public detectState(context: ClaudeStateContext): ClaudeCodeState {
    console.log(
      `[StateDetector] Message type: ${context.messageType}, isLastMessage: ${context.isLastMessage}, lastActivity: ${context.lastActivity ? new Date(context.lastActivity).toISOString() : "unknown"}`,
    );

    // Error conditions first
    if (this.hasError(context)) {
      return "error";
    }

    // Check for inactivity timeout (30 seconds)
    if (this.hasTimedOut(context)) {
      console.log(`[StateDetector] Claude TIMED OUT (>30s inactivity)`);
      return "idle";
    }

    // Running conditions
    if (this.isActivelyProcessing(context)) {
      return "running";
    }

    // Default to idle
    console.log(`[StateDetector] Claude is IDLE`);
    return "idle";
  }

  private hasError(context: ClaudeStateContext): boolean {
    return (
      context.lastMessage?.type === "error" ||
      context.lastMessage?.error ||
      (context.isLastMessage &&
        context.lastMessage?.type === "system" &&
        context.lastMessage?.content?.includes("error"))
    );
  }

  private hasTimedOut(context: ClaudeStateContext): boolean {
    if (!context.lastActivity) {
      return false; // No timestamp available
    }

    const now = Date.now();
    const inactivityMs = now - context.lastActivity;
    const timeoutMs = 120 * 1000; // 120 seconds (2 minutes)

    return inactivityMs > timeoutMs;
  }

  private isActivelyProcessing(context: ClaudeStateContext): boolean {
    const messageType = context.messageType;
    const isLastMessage = context.isLastMessage;

    console.log(
      `[StateDetector] Analyzing: messageType=${messageType}, isLastMessage=${isLastMessage}`,
    );

    // Key insight: Claude is IDLE when it finishes an assistant response
    // Claude is RUNNING when it's actively using tools or generating content

    // If this is the last message in the stream, analyze what type it is
    if (isLastMessage) {
      // Last message is a tool - Claude might continue processing
      if (messageType === "tool_use" || messageType === "tool_result") {
        return true;
      }

      // Last message is assistant - Claude finished responding, is idle
      if (messageType === "assistant") {
        return false;
      }

      // Last message is user - Claude should respond, but might not have started
      if (messageType === "user") {
        return false; // User just submitted, Claude hasn't started processing yet
      }

      return false; // Default to idle for last message
    }

    // If NOT the last message, check for active tool usage
    // Only tool usage indicates Claude is actively working
    if (messageType === "tool_use" || messageType === "tool_result") {
      return true;
    }

    // User messages in the middle of a stream mean Claude is responding
    if (messageType === "user") {
      return true;
    }

    // Assistant messages in the middle could be streaming content
    if (messageType === "assistant") {
      return true;
    }

    // Default to idle if no active indicators
    return false;
  }
}
