import { exec } from "node:child_process";
import { promisify } from "node:util";
import { query } from "@anthropic-ai/claude-code";
import { createMessageGenerator } from "../createMessageGenerator";
import type { StateDetector } from "../detection/StateDetector";
import type { TaskLifecycleService } from "../TaskLifecycleService";
import type { AliveTask, PendingTask, RunningTask } from "./task-types";

const execAsync = promisify(exec);

interface ClaudeCodeMessage {
  type: string;
  uuid?: string;
  session_id?: string;
  content?: unknown;
}

interface TaskSession {
  id: string;
  projectId: string;
  cwd: string;
  completionCondition?: string;
  originalPrompt?: string;
  autoContinue: boolean;
  baseSessionId?: string;
  generateMessages: () => string;
  abortController: AbortController;
  setNextMessage: (message: string) => void;
  setFirstMessagePromise: () => void;
  resolveFirstMessage: any;
}

/**
 * Pure task execution logic following SLAP.
 * Single responsibility: Execute tasks and process message streams.
 */
export class TaskExecutor {
  private claudeExecutablePath: string | null = null;

  constructor(
    private readonly lifecycle: TaskLifecycleService,
    private readonly stateDetector: StateDetector,
  ) {
    this.initializeClaudePath();
  }

  private async initializeClaudePath(): Promise<void> {
    try {
      const { stdout } = await execAsync("which claude");
      this.claudeExecutablePath = stdout.trim();
    } catch (error) {
      console.error("[TaskExecutor] Failed to find claude executable:", error);
      throw new Error("Claude executable not found in PATH");
    }
  }

  /**
   * Execute a pending task - single abstraction level
   */
  async executeTask(pendingTask: PendingTask): Promise<AliveTask> {
    const taskSession = this.createTaskSession(pendingTask);
    const runningTask = await this.processMessageStream(taskSession);
    return runningTask;
  }

  /**
   * Continue an existing task with new message
   */
  async continueTask(_task: AliveTask, message: string): Promise<void> {
    // Implement message continuation logic
    const messageGenerator = createMessageGenerator(message);
    // Update task with new message generator
    // Process continuation
    void messageGenerator; // Suppress unused variable warning
  }

  private createTaskSession(task: PendingTask): TaskSession {
    const messageGenerator = createMessageGenerator(task.originalPrompt || "");

    return {
      ...task,
      ...messageGenerator,
      abortController: new AbortController(),
    };
  }

  private async processMessageStream(
    taskSession: TaskSession,
  ): Promise<AliveTask> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const processStream = async () => {
        try {
          let currentTask: AliveTask | undefined;

          for await (const message of this.queryClaudeCode(taskSession)) {
            currentTask = this.updateTaskFromMessage(taskSession, message);

            if (currentTask && !resolved) {
              this.lifecycle.addTask(currentTask);
              resolve(currentTask);
              resolved = true;
            }

            await this.handleMessage(currentTask, message);
          }

          // Handle stream completion
          if (currentTask) {
            await this.handleStreamEnd(currentTask);
          }
        } catch (error) {
          this.handleExecutionError(taskSession, error, resolved, reject);
        }
      };

      void processStream();
    });
  }

  private queryClaudeCode(taskSession: TaskSession) {
    if (!this.claudeExecutablePath) {
      throw new Error("Claude executable path not initialized");
    }
    return query({
      prompt: taskSession.generateMessages(),
      options: {
        resume: taskSession.baseSessionId,
        cwd: taskSession.cwd,
        pathToClaudeCodeExecutable: this.claudeExecutablePath,
        permissionMode: "bypassPermissions",
        abortController: taskSession.abortController,
      },
    });
  }

  private updateTaskFromMessage(
    taskSession: TaskSession,
    message: ClaudeCodeMessage,
  ): AliveTask | undefined {
    if (
      (message.type === "user" || message.type === "assistant") &&
      message.uuid &&
      message.session_id
    ) {
      const runningTask: RunningTask = {
        status: "running",
        id: taskSession.id,
        projectId: taskSession.projectId,
        cwd: taskSession.cwd,
        completionCondition: taskSession.completionCondition,
        originalPrompt: taskSession.originalPrompt,
        autoContinue: taskSession.autoContinue,
        lastActivity: Date.now(),
        baseSessionId: taskSession.baseSessionId,
        sessionId: message.session_id,
        userMessageId: message.uuid,
        abortController: taskSession.abortController,
      };

      return runningTask;
    }

    return undefined;
  }

  private async handleMessage(
    task: AliveTask | undefined,
    message: ClaudeCodeMessage,
  ): Promise<void> {
    if (!task) return;

    // Update activity timestamp safely
    if ("lastActivity" in task) {
      (task as RunningTask).lastActivity = Date.now();
    }

    // Detect state and handle accordingly
    const claudeState = this.stateDetector.detectState({
      message,
      isLastMessage: false,
      lastActivity:
        task.status === "running"
          ? (task as RunningTask).lastActivity
          : Date.now(),
    });

    // Process state-specific logic
    console.log(
      `[TaskExecutor] Claude state: ${claudeState} for task ${task.id}`,
    );
  }

  private async handleStreamEnd(task: AliveTask): Promise<void> {
    console.log(`[TaskExecutor] Stream ended for task ${task.id}`);
    // Handle final state decisions
  }

  private handleExecutionError(
    taskSession: TaskSession,
    error: unknown,
    resolved: boolean,
    reject: (error: unknown) => void,
  ): void {
    if (!resolved) {
      reject(error);
    }

    console.error(
      `[TaskExecutor] Error executing task ${taskSession.id}:`,
      error,
    );

    const existingTask = this.lifecycle.findTaskById(taskSession.id);
    if (existingTask) {
      this.lifecycle.failTask(taskSession.id);
    }
  }
}
