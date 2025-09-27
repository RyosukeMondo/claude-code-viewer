import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { query } from "@anthropic-ai/claude-code";
import {
  createMessageGenerator,
  type MessageGenerator,
} from "../createMessageGenerator";
import type { StateDetector } from "../detection/StateDetector";
import type { TaskLifecycleService } from "../TaskLifecycleService";
import type {
  AliveTask,
  CompletionCondition,
  PendingTask,
  RunningTask,
} from "./task-types";

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
  completionCondition?: CompletionCondition;
  originalPrompt?: string;
  autoContinue?: boolean;
  baseSessionId?: string;
  generateMessages: MessageGenerator;
  abortController: AbortController;
  setNextMessage: (message: string) => void;
  setFirstMessagePromise: () => void;
  resolveFirstMessage: (value?: unknown) => void;
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
      console.log(`[TaskExecutor] Found claude executable at: ${this.claudeExecutablePath}`);
    } catch (error) {
      console.warn("[TaskExecutor] 'which claude' failed, trying fallback paths:", error);

      // Try common fallback paths
      const fallbackPaths = [
        resolve(process.cwd(), "node_modules/.bin/claude"),
        "/home/rmondo/.nvm/versions/node/v22.19.0/bin/claude",
        "claude" // Let the system PATH handle it
      ];

      for (const path of fallbackPaths) {
        try {
          // Test if the path exists and is executable
          await execAsync(`ls -la "${path}"`);
          this.claudeExecutablePath = path;
          console.log(`[TaskExecutor] Using fallback claude executable at: ${this.claudeExecutablePath}`);
          return;
        } catch (fallbackError) {
          console.warn(`[TaskExecutor] Fallback path ${path} not accessible:`, fallbackError);
        }
      }

      // If all fallbacks fail, use the absolute path as last resort
      this.claudeExecutablePath = resolve(process.cwd(), "node_modules/.bin/claude");
      console.warn(`[TaskExecutor] All paths failed, using last resort: ${this.claudeExecutablePath}`);
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
  async continueTask(task: AliveTask, message: string): Promise<void> {
    console.log(`[TaskExecutor] Continuing task ${task.id} with new message`);

    // Update lastActivity timestamp immediately
    const updatedTask = { ...task, lastActivity: Date.now() };
    this.lifecycle.updateTask(updatedTask);

    // Create new message generator and continue processing
    const messageGenerator = createMessageGenerator(message);

    // Start processing the new message stream for this task
    try {
      // Create a new session context for continuation
      const taskSession = {
        ...updatedTask,
        ...messageGenerator,
        abortController: new AbortController(),
      };

      // Process the continuation message stream
      await this.processMessageStream(taskSession);
    } catch (error) {
      console.error(`[TaskExecutor] Error continuing task ${task.id}:`, error);
      this.lifecycle.failTask(task.id);
      throw error;
    }
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
        autoContinue: taskSession.autoContinue ?? false,
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

    // Update activity timestamp safely using lifecycle service for immutable updates
    if (task.status === "running") {
      console.log(`[TaskExecutor] Activity detected for task ${task.id}`);
      // Update lastActivity timestamp through lifecycle service
      const updatedTask = { ...task, lastActivity: Date.now() };
      this.lifecycle.updateTask(updatedTask);
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
