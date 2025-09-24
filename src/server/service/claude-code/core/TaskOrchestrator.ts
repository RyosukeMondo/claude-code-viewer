import { ulid } from "ulid";
import type { TaskLifecycleService } from "../TaskLifecycleService";
import type { TaskExecutor } from "./TaskExecutor";
import type { AliveTask, PendingTask, TaskSessionConfig } from "./task-types";

/**
 * High-level task orchestration following SRP.
 * Single responsibility: Coordinate task creation and continuation.
 */
export class TaskOrchestrator {
  constructor(
    private readonly executor: TaskExecutor,
    private readonly lifecycle: TaskLifecycleService,
  ) {}

  /**
   * Start a new task or continue existing one
   */
  async startOrContinueTask(
    config: TaskSessionConfig,
    message: string,
  ): Promise<AliveTask> {
    const existingTask = this.findExistingTask(config.sessionId);

    if (existingTask) {
      return this.continueExistingTask(existingTask, message);
    }

    return this.startNewTask(config, message);
  }

  /**
   * Abort a running task
   */
  abortTask(sessionId: string, reason?: string): void {
    const task = this.lifecycle.findTaskBySessionId(sessionId);
    if (!task) {
      throw new Error(`Task not found for session: ${sessionId}`);
    }

    // Provide a reason for the abort to distinguish between user and system aborts
    const abortReason = reason || "Task aborted by user";
    task.abortController.abort(new Error(abortReason));
    this.lifecycle.failTask(task.id);
  }

  private findExistingTask(sessionId?: string): AliveTask | undefined {
    return sessionId
      ? this.lifecycle.findTaskBySessionId(sessionId)
      : undefined;
  }

  private async continueExistingTask(
    task: AliveTask,
    message: string,
  ): Promise<AliveTask> {
    // Delegate to executor for message handling
    await this.executor.continueTask(task, message);
    return task;
  }

  private async startNewTask(
    config: TaskSessionConfig,
    message: string,
  ): Promise<AliveTask> {
    const pendingTask = this.createPendingTask(config, message);

    console.log(
      `[TaskOrchestrator] Creating task ${pendingTask.id} with condition: ${pendingTask.completionCondition}`,
    );

    return this.executor.executeTask(pendingTask);
  }

  private createPendingTask(
    config: TaskSessionConfig,
    message: string,
  ): PendingTask {
    return {
      status: "pending",
      id: ulid(),
      projectId: config.projectId,
      baseSessionId: config.sessionId,
      cwd: config.cwd,
      completionCondition: config.completionCondition,
      originalPrompt: message,
      autoContinue: config.autoContinue,
      lastActivity: Date.now(),
    };
  }
}
