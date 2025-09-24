import prexit from "prexit";
import { type EventBus, getEventBus } from "../events/EventBus";
import { TaskExecutor } from "./core/TaskExecutor";
import { TaskOrchestrator } from "./core/TaskOrchestrator";
import type { AliveTask, TaskSessionConfig } from "./core/task-types";
import { StateDetector } from "./detection/StateDetector";
import { TaskLifecycleService } from "./TaskLifecycleService";

/**
 * Simplified main controller for Claude Code task management.
 * Now follows SRP: Only responsible for high-level coordination
 * Improved SLAP: Single level of abstraction throughout
 */
export class ClaudeCodeTaskController {
  private readonly eventBus: EventBus;
  private readonly taskLifecycle: TaskLifecycleService;
  private readonly stateDetector: StateDetector;
  private readonly taskOrchestrator: TaskOrchestrator;

  constructor() {
    this.eventBus = getEventBus();
    this.taskLifecycle = new TaskLifecycleService(this.eventBus);
    this.stateDetector = new StateDetector();

    // Create task executor and orchestrator
    const taskExecutor = new TaskExecutor(
      this.taskLifecycle,
      this.stateDetector,
    );
    this.taskOrchestrator = new TaskOrchestrator(
      taskExecutor,
      this.taskLifecycle,
    );

    this.setupCleanupHandlers();
  }

  public get aliveTasks(): AliveTask[] {
    return this.taskLifecycle.aliveTasks;
  }

  public async startOrContinueTask(
    sessionConfig: TaskSessionConfig,
    message: string,
  ): Promise<AliveTask> {
    return this.taskOrchestrator.startOrContinueTask(sessionConfig, message);
  }

  public abortTask(sessionId: string, reason?: string): void {
    this.taskOrchestrator.abortTask(sessionId, reason);
  }

  private setupCleanupHandlers(): void {
    prexit(() => {
      this.taskLifecycle.abortAllAliveTasks();
    });
  }
}
