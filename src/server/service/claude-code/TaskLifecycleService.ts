import type { EventBus } from "../events/EventBus";
import type { AliveClaudeCodeTask, ClaudeCodeTask } from "./types";

/**
 * Manages task lifecycle states and transitions.
 * Responsible for task state management and notifications.
 */
export class TaskLifecycleService {
  private tasks: ClaudeCodeTask[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  public get aliveTasks(): AliveClaudeCodeTask[] {
    return this.tasks.filter(
      (task): task is AliveClaudeCodeTask =>
        task.status === "running" || task.status === "paused",
    );
  }

  public getAllTasks(): ClaudeCodeTask[] {
    return [...this.tasks];
  }

  public findTaskById(taskId: string): ClaudeCodeTask | undefined {
    return this.tasks.find((task) => task.id === taskId);
  }

  public findTaskBySessionId(
    sessionId: string,
  ): AliveClaudeCodeTask | undefined {
    return this.aliveTasks.find((task) => task.sessionId === sessionId);
  }

  public addTask(task: ClaudeCodeTask): void {
    this.tasks.push(task);
    this.emitTaskChanged();
  }

  public updateTask(updatedTask: ClaudeCodeTask): void {
    const index = this.tasks.findIndex((task) => task.id === updatedTask.id);
    if (index === -1) {
      throw new Error(`Task not found: ${updatedTask.id}`);
    }

    const existingTask = this.tasks[index];
    if (!existingTask) {
      throw new Error(`Task not found: ${updatedTask.id}`);
    }

    // Update the task in place to maintain reference integrity
    Object.assign(existingTask, updatedTask);
    this.emitTaskChanged();
  }

  public completeTask(taskId: string): void {
    const task = this.findTaskById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // For completed tasks, we need sessionId and userMessageId
    if (task.status === "running" || task.status === "paused") {
      this.updateTask({
        ...task,
        status: "completed",
        sessionId: task.sessionId,
        userMessageId: task.userMessageId,
        abortController: task.abortController,
        resolveFirstMessage: task.resolveFirstMessage,
      });
    } else {
      throw new Error(
        `Cannot complete task ${taskId} with status ${task.status}`,
      );
    }
  }

  public pauseTask(taskId: string): void {
    const task = this.findTaskById(taskId);
    if (!task || (task.status !== "running" && task.status !== "paused")) {
      throw new Error(`Cannot pause task: ${taskId}`);
    }

    this.updateTask({ ...task, status: "paused" });
  }

  public failTask(taskId: string): void {
    const task = this.findTaskById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    this.updateTask({ ...task, status: "failed" });
  }

  public abortAllAliveTasks(): void {
    this.aliveTasks.forEach((task) => {
      if ("abortController" in task) {
        task.abortController.abort();
      }
    });
  }

  private emitTaskChanged(): void {
    this.eventBus.emit("task_changed", {
      type: "task_changed",
      data: this.aliveTasks,
    });
  }
}
