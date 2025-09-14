import { execSync } from "node:child_process";
import { query } from "@anthropic-ai/claude-code";
import prexit from "prexit";
import { ulid } from "ulid";
import { type EventBus, getEventBus } from "../events/EventBus";
import { ClaudeCodeStateDetector } from "./ClaudeCodeStateDetector";
import { createMessageGenerator } from "./createMessageGenerator";
import { TaskLifecycleService } from "./TaskLifecycleService";
import { TaskStateOrchestrator } from "./TaskStateOrchestrator";
import type {
  AliveClaudeCodeTask,
  PendingClaudeCodeTask,
  RunningClaudeCodeTask,
  TaskSessionConfig,
} from "./types";
import { WorkflowCompletionDetector } from "./WorkflowCompletionDetector";

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
  private readonly stateDetector: ClaudeCodeStateDetector;
  private readonly workflowDetector: WorkflowCompletionDetector;
  private readonly orchestrator: TaskStateOrchestrator;

  constructor() {
    this.pathToClaudeCodeExecutable = this.getClaudeExecutablePath();
    this.eventBus = getEventBus();
    this.taskLifecycle = new TaskLifecycleService(this.eventBus);
    this.stateDetector = new ClaudeCodeStateDetector();
    this.workflowDetector = new WorkflowCompletionDetector();
    this.orchestrator = new TaskStateOrchestrator();

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
      lastActivity: Date.now(), // Initialize with current timestamp
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

          let lastMessage: any = null;
          let finalDecision: { wasExecuted: boolean } | null = null;

          for await (const message of this.queryClaudeCode(
            pendingTask,
            abortController,
          )) {
            lastMessage = message;
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

            // Update activity timestamp for any message
            if (currentTask) {
              currentTask.lastActivity = Date.now();
            }

            await this.processMessage(pendingTask, message);

            // Use new state-driven decision making
            finalDecision = await this.handleTaskStateDecision(
              currentTask,
              message,
              false, // isLastMessage
            );

            console.log(
              `[TaskController] Message processed, finalDecision.wasExecuted: ${finalDecision?.wasExecuted}`,
            );
          }

          console.log(
            `[TaskController] For loop completed, handling stream end`,
          );

          // Handle final stream end decision if no decision was made
          console.log(
            `[TaskController] Stream ended. finalDecision?.wasExecuted: ${finalDecision?.wasExecuted}, currentTask: ${currentTask?.id}`,
          );

          if (currentTask && !finalDecision?.wasExecuted) {
            console.log(
              `[TaskController] Handling stream end for task ${currentTask.id}`,
            );
            await this.handleTaskStateDecision(
              currentTask,
              lastMessage,
              true, // isLastMessage
            );
          } else if (currentTask && finalDecision?.wasExecuted) {
            console.log(
              `[TaskController] Skipping stream end - decision already executed for task ${currentTask.id}`,
            );
          }
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
        lastActivity: Date.now(), // Update activity timestamp
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

  /**
   * New state-driven task decision handling.
   * 1. Detect Claude state 2. Analyze workflow 3. Decide action 4. Execute
   */
  private async handleTaskStateDecision(
    currentTask: AliveClaudeCodeTask | undefined,
    message: any,
    isLastMessage: boolean,
  ) {
    if (!currentTask) {
      return { wasExecuted: false };
    }

    // Step 1: Detect Claude Code state
    const claudeState = this.stateDetector.detectState({
      lastMessage: message,
      isStreamActive: !isLastMessage,
      isLastMessage,
      messageType: message?.type,
      lastActivity: currentTask.lastActivity,
    });

    console.log(
      `[TaskController] Claude state: ${claudeState}, Task: ${currentTask.id}`,
    );

    // Step 2: Analyze workflow status (if applicable)
    const workflowStatus = await this.workflowDetector.detectWorkflowStatus({
      task: currentTask,
      claudeState,
    });

    // Step 3: Decide action based on states
    const decision = this.orchestrator.decideTaskAction({
      claudeState,
      workflowStatus,
      task: currentTask,
      canAutoContinue: this.orchestrator.canTaskAutoContinue(currentTask),
    });

    console.log(
      `[TaskController] Decision for task ${currentTask.id}: ${decision.action} (${decision.reason})`,
    );

    // Step 4: Execute decision
    if (decision.shouldExecute) {
      await this.executeTaskAction(
        currentTask,
        decision.action,
        decision.reason,
      );
      return { wasExecuted: true };
    }

    return { wasExecuted: false };
  }

  /**
   * Execute the decided task action
   */
  private async executeTaskAction(
    task: AliveClaudeCodeTask,
    action: "continue" | "pause" | "complete" | "restart",
    reason: string,
  ): Promise<void> {
    switch (action) {
      case "continue":
        // No action needed, continue processing
        break;

      case "pause":
        console.log(`[TaskController] Pausing task ${task.id}: ${reason}`);
        this.taskLifecycle.pauseTask(task.id);
        task.setFirstMessagePromise();
        break;

      case "complete":
        console.log(`[TaskController] Completing task ${task.id}: ${reason}`);
        this.taskLifecycle.completeTask(task.id);
        break;

      case "restart":
        console.log(`[TaskController] Restarting task ${task.id}: ${reason}`);
        // Complete current task and start new one
        this.taskLifecycle.completeTask(task.id);
        await this.startNewTask(
          {
            projectId: task.projectId,
            cwd: task.cwd,
            completionCondition: task.completionCondition,
            autoContinue: task.autoContinue,
          },
          task.originalPrompt || "Continue previous task",
        );
        break;

      default:
        console.warn(`[TaskController] Unknown action: ${action}`);
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
