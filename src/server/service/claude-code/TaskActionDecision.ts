import type { AliveClaudeCodeTask } from "./types";

/**
 * Task action decision types
 */
export type TaskAction = "continue" | "pause" | "complete" | "restart";

export interface TaskDecision {
  action: TaskAction;
  reason: string;
  shouldExecute: boolean;
}

/**
 * Claude Code state types
 */
export type ClaudeState = "active" | "idle" | "completed" | "error";

/**
 * Workflow status from spec-workflow analysis
 */
export interface WorkflowStatus {
  isComplete: boolean;
  hasProgress: boolean;
  canContinue: boolean;
}

/**
 * Simple, focused task action decision maker.
 *
 * PRINCIPLES APPLIED:
 * - SLAP: Each method operates at the same level of abstraction
 * - SRP: Single responsibility - only makes action decisions
 * - KISS: Simple decision rules without complex state machines
 */
export class TaskActionDecision {
  /**
   * Decide what action to take based on current states.
   * High-level decision logic only - no implementation details.
   */
  decide(
    claudeState: ClaudeState,
    workflowStatus: WorkflowStatus,
    _task: AliveClaudeCodeTask,
    canAutoContinue: boolean,
  ): TaskDecision {
    // Completion check
    if (this.shouldComplete(claudeState, workflowStatus)) {
      return {
        action: "complete",
        reason: "Task completed successfully",
        shouldExecute: true,
      };
    }

    // Error handling
    if (this.shouldPause(claudeState, workflowStatus)) {
      return {
        action: "pause",
        reason: "Claude inactive or error state",
        shouldExecute: true,
      };
    }

    // Auto-continuation
    if (this.shouldRestart(claudeState, workflowStatus, canAutoContinue)) {
      return {
        action: "restart",
        reason: "Auto-continue with remaining tasks",
        shouldExecute: true,
      };
    }

    // Default: continue current execution
    return {
      action: "continue",
      reason: "Continue current execution",
      shouldExecute: false,
    };
  }

  /**
   * Check if task should be completed.
   * Single level of abstraction - only completion logic.
   */
  private shouldComplete(
    claudeState: ClaudeState,
    workflowStatus: WorkflowStatus,
  ): boolean {
    return claudeState === "completed" && workflowStatus.isComplete;
  }

  /**
   * Check if task should be paused.
   * Single level of abstraction - only pause logic.
   */
  private shouldPause(
    claudeState: ClaudeState,
    workflowStatus: WorkflowStatus,
  ): boolean {
    return (
      claudeState === "error" ||
      (claudeState === "idle" && !workflowStatus.canContinue)
    );
  }

  /**
   * Check if task should be restarted.
   * Single level of abstraction - only restart logic.
   */
  private shouldRestart(
    claudeState: ClaudeState,
    workflowStatus: WorkflowStatus,
    canAutoContinue: boolean,
  ): boolean {
    return (
      canAutoContinue &&
      claudeState === "completed" &&
      workflowStatus.hasProgress &&
      !workflowStatus.isComplete
    );
  }
}

// Export singleton instance
export const taskActionDecision = new TaskActionDecision();
