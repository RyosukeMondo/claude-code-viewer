import { execSync } from "node:child_process";
import { query } from "@anthropic-ai/claude-code";
import prexit from "prexit";
import { ulid } from "ulid";
import { type EventBus, getEventBus } from "../events/EventBus";
import { createMessageGenerator } from "./createMessageGenerator";
import { SessionContinuationHandler } from "./SessionContinuationHandler";
import { SpecWorkflowHandler } from "./SpecWorkflowHandler";
import { TaskLifecycleService } from "./TaskLifecycleService";
import type {
  AliveClaudeCodeTask,
  PendingClaudeCodeTask,
  RunningClaudeCodeTask,
  TaskSessionConfig,
} from "./types";

/**
 * Main controller for Claude Code task management.
 * Orchestrates task lifecycle, session continuation, and spec-workflow handling.
 *
 * Follows SRP: Only responsible for orchestrating other services
 * Follows SSOT: Single source of truth for task management
 * Follows KISS: Simple orchestration logic
 * Follows SLAP: Single level of abstraction
 */
export class ClaudeCodeTaskController {
  private readonly pathToClaudeCodeExecutable: string;
  private readonly eventBus: EventBus;
  private readonly taskLifecycle: TaskLifecycleService;
  private readonly continuationHandler: SessionContinuationHandler;
  private readonly specWorkflowHandler: SpecWorkflowHandler;

  constructor() {
    this.pathToClaudeCodeExecutable = this.getClaudeExecutablePath();
    this.eventBus = getEventBus();
    this.taskLifecycle = new TaskLifecycleService(this.eventBus);
    this.continuationHandler = new SessionContinuationHandler(this.eventBus);
    this.specWorkflowHandler = new SpecWorkflowHandler(
      this.continuationHandler,
    );

    this.setupCleanupHandlers();
  }

  public get aliveTasks(): AliveClaudeCodeTask[] {
    return this.taskLifecycle.aliveTasks;
  }

  public async startOrContinueTask(
    sessionConfig: TaskSessionConfig,
    message: string,
  ): Promise<AliveClaudeCodeTask> {
    const existingTask = this.findExistingTask(sessionConfig.sessionId);

    if (existingTask) {
      return this.continueExistingTask(existingTask, message);
    }

    return this.startNewTask(sessionConfig, message);
  }

  public abortTask(sessionId: string): void {
    const task = this.taskLifecycle.findTaskBySessionId(sessionId);
    if (!task) {
      throw new Error("Alive Task not found");
    }

    task.abortController.abort();
    this.taskLifecycle.failTask(task.id);
  }

  private getClaudeExecutablePath(): string {
    return execSync("which claude", {}).toString().trim();
  }

  private setupCleanupHandlers(): void {
    prexit(() => {
      this.taskLifecycle.abortAllAliveTasks();
    });
  }

  private findExistingTask(
    sessionId?: string,
  ): AliveClaudeCodeTask | undefined {
    return sessionId
      ? this.taskLifecycle.findTaskBySessionId(sessionId)
      : undefined;
  }

  private async continueExistingTask(
    task: AliveClaudeCodeTask,
    message: string,
  ): Promise<AliveClaudeCodeTask> {
    task.setNextMessage(message);
    await task.awaitFirstMessage();
    return task;
  }

  private async startNewTask(
    sessionConfig: TaskSessionConfig,
    message: string,
  ): Promise<AliveClaudeCodeTask> {
    const pendingTask = this.createPendingTask(sessionConfig, message);

    console.log(
      `[TaskController] Creating task ${pendingTask.id} with completionCondition: ${pendingTask.completionCondition}, originalPrompt: "${pendingTask.originalPrompt}"`,
    );

    return this.executeTask(pendingTask);
  }

  private createPendingTask(
    sessionConfig: TaskSessionConfig,
    message: string,
  ): PendingClaudeCodeTask {
    const messageGenerator = createMessageGenerator(message);

    return {
      status: "pending",
      id: ulid(),
      projectId: sessionConfig.projectId,
      baseSessionId: sessionConfig.sessionId,
      cwd: sessionConfig.cwd,
      completionCondition: sessionConfig.completionCondition,
      originalPrompt: message,
      autoContinue: sessionConfig.autoContinue,
      onMessageHandlers: [],
      ...messageGenerator,
    };
  }

  private async executeTask(
    pendingTask: PendingClaudeCodeTask,
  ): Promise<AliveClaudeCodeTask> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const handleExecution = async () => {
        try {
          const abortController = new AbortController();
          let currentTask: AliveClaudeCodeTask | undefined;

          for await (const message of this.queryClaudeCode(
            pendingTask,
            abortController,
          )) {
            currentTask = this.updateTaskFromMessage(
              pendingTask,
              message,
              abortController,
            );

            if (currentTask && !resolved) {
              this.taskLifecycle.addTask(currentTask);
              resolve(currentTask);
              resolved = true;
              pendingTask.resolveFirstMessage();
            }

            await this.processMessage(pendingTask, message);
            await this.handleTaskCompletion(currentTask, message);
          }

          this.completeTaskExecution(currentTask);
        } catch (error) {
          this.handleExecutionError(pendingTask, error, resolved, reject);
        }
      };

      void handleExecution();
    });
  }

  private queryClaudeCode(
    task: PendingClaudeCodeTask,
    abortController: AbortController,
  ) {
    return query({
      prompt: task.generateMessages(),
      options: {
        resume: task.baseSessionId,
        cwd: task.cwd,
        pathToClaudeCodeExecutable: this.pathToClaudeCodeExecutable,
        permissionMode: "bypassPermissions",
        abortController,
      },
    });
  }

  private updateTaskFromMessage(
    pendingTask: PendingClaudeCodeTask,
    message: any,
    abortController: AbortController,
  ): AliveClaudeCodeTask | undefined {
    if (
      (message.type === "user" || message.type === "assistant") &&
      message.uuid
    ) {
      const runningTask: RunningClaudeCodeTask = {
        status: "running",
        id: pendingTask.id,
        projectId: pendingTask.projectId,
        cwd: pendingTask.cwd,
        completionCondition: pendingTask.completionCondition,
        originalPrompt: pendingTask.originalPrompt,
        autoContinue: pendingTask.autoContinue,
        generateMessages: pendingTask.generateMessages,
        setNextMessage: pendingTask.setNextMessage,
        resolveFirstMessage: pendingTask.resolveFirstMessage,
        setFirstMessagePromise: pendingTask.setFirstMessagePromise,
        awaitFirstMessage: pendingTask.awaitFirstMessage,
        onMessageHandlers: pendingTask.onMessageHandlers,
        userMessageId: message.uuid,
        sessionId: message.session_id,
        abortController,
      };

      return runningTask;
    }

    return undefined;
  }

  private async processMessage(
    pendingTask: PendingClaudeCodeTask,
    message: any,
  ): Promise<void> {
    await Promise.all(
      pendingTask.onMessageHandlers.map((handler) => handler(message)),
    );
  }

  private async handleTaskCompletion(
    currentTask: AliveClaudeCodeTask | undefined,
    message: any,
  ): Promise<void> {
    if (currentTask && message.type === "result") {
      console.log(
        `[TaskController] Result received for task ${currentTask.id}, completionCondition: ${currentTask.completionCondition}`,
      );

      if (currentTask.completionCondition === "spec-workflow") {
        await this.handleSpecWorkflowTask(currentTask);
      } else {
        this.handleDefaultTask(currentTask);
      }
    }
  }

  private async handleSpecWorkflowTask(
    currentTask: AliveClaudeCodeTask,
  ): Promise<void> {
    await this.specWorkflowHandler.handleCompletion(
      currentTask,
      (config, message) => this.startNewTask(config, message),
      (taskId) => this.taskLifecycle.completeTask(taskId),
      (taskId) => this.taskLifecycle.pauseTask(taskId),
    );
  }

  private handleDefaultTask(currentTask: AliveClaudeCodeTask): void {
    console.log(
      `[TaskController] Task ${currentTask.id} pausing for user input (no completion condition)`,
    );

    this.taskLifecycle.pauseTask(currentTask.id);
    currentTask.setFirstMessagePromise();
  }

  private completeTaskExecution(
    currentTask: AliveClaudeCodeTask | undefined,
  ): void {
    if (currentTask) {
      this.taskLifecycle.completeTask(currentTask.id);
    }
  }

  private handleExecutionError(
    pendingTask: PendingClaudeCodeTask,
    error: unknown,
    resolved: boolean,
    reject: (error: unknown) => void,
  ): void {
    if (!resolved) {
      reject(error);
    }

    console.error("Error executing task", error);

    // Try to find the task in the lifecycle service and mark it as failed
    const existingTask = this.taskLifecycle.findTaskById(pendingTask.id);
    if (existingTask) {
      this.taskLifecycle.failTask(pendingTask.id);
    }
  }
}
