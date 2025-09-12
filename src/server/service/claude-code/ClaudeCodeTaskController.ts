import { execSync } from "node:child_process";
import { query } from "@anthropic-ai/claude-code";
import prexit from "prexit";
import { ulid } from "ulid";
import { type EventBus, getEventBus } from "../events/EventBus";
import { taskMonitoringService } from "../TaskMonitoringService";
import { createMessageGenerator } from "./createMessageGenerator";
import type {
  AliveClaudeCodeTask,
  ClaudeCodeTask,
  PendingClaudeCodeTask,
  RunningClaudeCodeTask,
} from "./types";

export class ClaudeCodeTaskController {
  private pathToClaudeCodeExecutable: string;
  private tasks: ClaudeCodeTask[] = [];
  private eventBus: EventBus;

  constructor() {
    this.pathToClaudeCodeExecutable = execSync("which claude", {})
      .toString()
      .trim();
    this.eventBus = getEventBus();

    prexit(() => {
      this.aliveTasks.forEach((task) => {
        task.abortController.abort();
      });
    });
  }

  public get aliveTasks() {
    return this.tasks.filter(
      (task) => task.status === "running" || task.status === "paused",
    );
  }

  public async startOrContinueTask(
    currentSession: {
      cwd: string;
      projectId: string;
      sessionId?: string;
      completionCondition?: "spec-workflow" | undefined;
      autoContinue?: boolean;
    },
    message: string,
  ): Promise<AliveClaudeCodeTask> {
    const existingTask = this.aliveTasks.find(
      (task) => task.sessionId === currentSession.sessionId,
    );

    if (existingTask) {
      return await this.continueTask(existingTask, message);
    } else {
      return await this.startTask(currentSession, message);
    }
  }

  private async continueTask(task: AliveClaudeCodeTask, message: string) {
    task.setNextMessage(message);
    await task.awaitFirstMessage();
    return task;
  }

  private startTask(
    currentSession: {
      cwd: string;
      projectId: string;
      sessionId?: string;
      completionCondition?: "spec-workflow" | undefined;
      autoContinue?: boolean;
    },
    message: string,
  ) {
    const {
      generateMessages,
      setNextMessage,
      setFirstMessagePromise,
      resolveFirstMessage,
      awaitFirstMessage,
    } = createMessageGenerator(message);

    const task: PendingClaudeCodeTask = {
      status: "pending",
      id: ulid(),
      projectId: currentSession.projectId,
      baseSessionId: currentSession.sessionId,
      cwd: currentSession.cwd,
      completionCondition: currentSession.completionCondition,
      originalPrompt: message, // store original user prompt for session continuation
      autoContinue: currentSession.autoContinue,
      generateMessages,
      setNextMessage,
      setFirstMessagePromise,
      resolveFirstMessage,
      awaitFirstMessage,
      onMessageHandlers: [],
    };

    console.log(
      `[TaskController] Creating task ${task.id} with completionCondition: ${task.completionCondition}, originalPrompt: "${task.originalPrompt}"`,
    );

    let aliveTaskResolve: (task: AliveClaudeCodeTask) => void;
    let aliveTaskReject: (error: unknown) => void;

    const aliveTaskPromise = new Promise<AliveClaudeCodeTask>(
      (resolve, reject) => {
        aliveTaskResolve = resolve;
        aliveTaskReject = reject;
      },
    );

    let resolved = false;

    const handleTask = async () => {
      try {
        const abortController = new AbortController();

        let currentTask: AliveClaudeCodeTask | undefined;

        for await (const message of query({
          prompt: task.generateMessages(),
          options: {
            resume: task.baseSessionId,
            cwd: task.cwd,
            pathToClaudeCodeExecutable: this.pathToClaudeCodeExecutable,
            permissionMode: "bypassPermissions",
            abortController: abortController,
          },
        })) {
          currentTask ??= this.aliveTasks.find((t) => t.id === task.id);

          if (currentTask !== undefined && currentTask.status === "paused") {
            this.updateExistingTask({
              ...currentTask,
              status: "running",
            });
          }

          // 初回の system message だとまだ history ファイルが作成されていないので
          if (
            (message.type === "user" || message.type === "assistant") &&
            message.uuid !== undefined
          ) {
            if (!resolved) {
              const runningTask: RunningClaudeCodeTask = {
                status: "running",
                id: task.id,
                projectId: task.projectId,
                cwd: task.cwd,
                completionCondition: task.completionCondition,
                originalPrompt: task.originalPrompt,
                autoContinue: task.autoContinue,
                generateMessages: task.generateMessages,
                setNextMessage: task.setNextMessage,
                resolveFirstMessage: task.resolveFirstMessage,
                setFirstMessagePromise: task.setFirstMessagePromise,
                awaitFirstMessage: task.awaitFirstMessage,
                onMessageHandlers: task.onMessageHandlers,
                userMessageId: message.uuid,
                sessionId: message.session_id,
                abortController: abortController,
              };
              this.tasks.push(runningTask);
              aliveTaskResolve(runningTask);
              resolved = true;
            }

            resolveFirstMessage();
          }

          await Promise.all(
            task.onMessageHandlers.map(async (onMessageHandler) => {
              await onMessageHandler(message);
            }),
          );

          if (currentTask !== undefined && message.type === "result") {
            console.log(
              `[TaskController] Result received for task ${currentTask.id}, completionCondition: ${currentTask.completionCondition}`,
            );

            // Check if task should continue automatically based on completion condition
            if (currentTask.completionCondition === "spec-workflow") {
              // For spec-workflow, check if current session's workflow is complete
              await this.handleSpecWorkflowCompletion(
                currentTask,
                setNextMessage,
                setFirstMessagePromise,
              );
            } else {
              // Default behavior: pause for user input
              console.log(
                `[TaskController] Task ${currentTask.id} pausing for user input (no completion condition)`,
              );
              this.updateExistingTask({
                ...currentTask,
                status: "paused",
              });
              resolved = true;
              setFirstMessagePromise();
            }
          }
        }

        const updatedTask = this.aliveTasks.find((t) => t.id === task.id);

        if (updatedTask === undefined) {
          const error = new Error(
            `illegal state: task is not running, task: ${JSON.stringify(updatedTask)}`,
          );
          aliveTaskReject(error);
          throw error;
        }

        this.updateExistingTask({
          ...updatedTask,
          status: "completed",
        });
      } catch (error) {
        if (!resolved) {
          aliveTaskReject(error);
          resolved = true;
        }

        console.error("Error resuming task", error);
        this.updateExistingTask({
          ...task,
          status: "failed",
        });
      }
    };

    // continue background
    void handleTask();

    return aliveTaskPromise;
  }

  public abortTask(sessionId: string) {
    const task = this.aliveTasks.find((task) => task.sessionId === sessionId);
    if (!task) {
      throw new Error("Alive Task not found");
    }

    task.abortController.abort();
    this.updateExistingTask({
      id: task.id,
      projectId: task.projectId,
      sessionId: task.sessionId,
      status: "failed",
      cwd: task.cwd,
      completionCondition: task.completionCondition,
      originalPrompt: task.originalPrompt,
      autoContinue: task.autoContinue,
      generateMessages: task.generateMessages,
      setNextMessage: task.setNextMessage,
      resolveFirstMessage: task.resolveFirstMessage,
      setFirstMessagePromise: task.setFirstMessagePromise,
      awaitFirstMessage: task.awaitFirstMessage,
      onMessageHandlers: task.onMessageHandlers,
      baseSessionId: task.baseSessionId,
      userMessageId: task.userMessageId,
    });
  }

  private async handleSpecWorkflowCompletion(
    currentTask: AliveClaudeCodeTask,
    _setNextMessage: (message: string) => void,
    _setFirstMessagePromise: () => void,
  ) {
    try {
      // Check if we have a session to monitor
      if (!currentTask.sessionId) {
        console.log(
          `[TaskController] No session ID available for task ${currentTask.id}, aborting task`,
        );
        this.updateExistingTask({
          ...currentTask,
          status: "failed",
        });
        return;
      }

      // Get the current session and monitor for spec-workflow completion
      const { getSession } = await import("../session/getSession");
      const { session } = await getSession(
        currentTask.projectId,
        currentTask.sessionId,
      );

      // Monitor the session for spec-workflow progress
      const taskProgress = taskMonitoringService.monitorSession(
        session,
        currentTask.id,
      );

      if (
        taskProgress &&
        taskMonitoringService.isAllTasksCompleted(taskProgress)
      ) {
        console.log(
          `[TaskController] Spec-workflow completed! Task ${currentTask.id} accomplished. Stopping task.`,
        );

        // Workflow is complete, stop the task as accomplished
        this.updateExistingTask({
          ...currentTask,
          status: "completed",
        });
        return;
      } else {
        console.log(
          `[TaskController] Spec-workflow incomplete. Auto-continue: ${currentTask.autoContinue}`,
        );

        if (currentTask.autoContinue && currentTask.originalPrompt) {
          console.log(
            `[TaskController] Auto-continuing task ${currentTask.id} with new session`,
          );

          // Automatically start a new task with the same prompt
          // Use setTimeout to avoid blocking the current task completion
          setTimeout(async () => {
            try {
              // First, mark the current task as completed since we're continuing
              this.updateExistingTask({
                ...currentTask,
                status: "completed",
              });

              console.log(
                `[TaskController] Starting auto-continue for task ${currentTask.id}`,
              );

              const newTask = await this.startOrContinueTask(
                {
                  projectId: currentTask.projectId,
                  cwd: currentTask.cwd,
                  completionCondition: currentTask.completionCondition,
                  autoContinue: currentTask.autoContinue,
                },
                currentTask.originalPrompt!,
              );

              console.log(
                `[TaskController] Auto-continue successful: task ${newTask.id}, session: ${newTask.sessionId}`,
              );

              // Signal frontend to navigate to the new session
              const navigationEvent = {
                type: "navigate_to_session" as const,
                data: {
                  projectId: currentTask.projectId,
                  sessionId: newTask.sessionId,
                  userMessageId: newTask.userMessageId,
                  reason: "auto_continue_success" as const,
                },
              };

              console.log(
                `[TaskController] Emitting navigate_to_session event:`,
                navigationEvent,
              );
              this.eventBus.emit("navigate_to_session", navigationEvent);

              // Set a fallback timeout in case navigation fails
              setTimeout(() => {
                const stillRunningTask = this.aliveTasks.find(
                  (t) => t.id === newTask.id,
                );
                if (stillRunningTask && stillRunningTask.status === "running") {
                  console.log(
                    `[TaskController] Navigation fallback: task ${newTask.id} still running, ensuring it's visible`,
                  );
                  // Emit a secondary navigation event as fallback
                  this.eventBus.emit("navigate_to_session", {
                    type: "navigate_to_session" as const,
                    data: {
                      projectId: currentTask.projectId,
                      sessionId: newTask.sessionId!,
                      userMessageId: newTask.userMessageId!,
                      reason: "auto_continue_success" as const,
                    },
                  });
                }
              }, 5000); // 5 second fallback check
            } catch (error) {
              console.error(`[TaskController] Auto-continue failed:`, error);

              // Fallback to manual navigation
              this.eventBus.emit("navigate_to_project", {
                type: "navigate_to_project",
                data: {
                  projectId: currentTask.projectId,
                  taskId: currentTask.id,
                  originalPrompt: currentTask.originalPrompt,
                  reason: "auto_continue_failed",
                  autoContinue: false, // Force manual continuation
                },
              });
            }
          }, 2000); // Delay to ensure current session is properly closed

          // Don't update task status here, let the setTimeout handle it
          return; // Exit early to avoid setting task to paused
        } else {
          console.log(`[TaskController] Manual continuation required`);

          // Signal the frontend to navigate to project page for manual continuation
          this.eventBus.emit("navigate_to_project", {
            type: "navigate_to_project",
            data: {
              projectId: currentTask.projectId,
              taskId: currentTask.id,
              originalPrompt: currentTask.originalPrompt,
              reason: "spec_workflow_incomplete",
              autoContinue: false,
            },
          });

          // Keep task active but pause the current session for manual continuation
          this.updateExistingTask({
            ...currentTask,
            status: "paused", // Pause current session but keep task available for continuation
          });
        }
      }
    } catch (error) {
      console.error(
        `[TaskController] Error handling spec-workflow completion:`,
        error,
      );

      // No fallback - abort task on error
      console.log(
        `[TaskController] Aborting task ${currentTask.id} due to error`,
      );
      this.updateExistingTask({
        ...currentTask,
        status: "failed",
      });
    }
  }

  private updateExistingTask(task: ClaudeCodeTask) {
    const target = this.tasks.find((t) => t.id === task.id);

    if (!target) {
      throw new Error("Task not found");
    }

    Object.assign(target, task);

    this.eventBus.emit("task_changed", {
      type: "task_changed",
      data: this.aliveTasks,
    });
  }
}
