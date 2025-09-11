import type { WatchEventType } from "node:fs";
import type { SerializableAliveTask } from "../claude-code/types";
import type { TaskProgress } from "../TaskMonitoringService";
import type { AutomationError } from "../types/automation";

export type WatcherEvent =
  | {
      eventType: "project_changed";
      data: ProjectChangedData;
    }
  | {
      eventType: "session_changed";
      data: SessionChangedData;
    };

export type BaseSSEEvent = {
  id: string;
  timestamp: string;
};

export type SSEEvent = BaseSSEEvent &
  (
    | {
        type: "connected";
        message: string;
        timestamp: string;
      }
    | {
        type: "heartbeat";
        timestamp: string;
      }
    | {
        type: "project_changed";
        data: ProjectChangedData;
      }
    | {
        type: "session_changed";
        data: SessionChangedData;
      }
    | {
        type: "task_changed";
        data: SerializableAliveTask[];
      }
    | {
        type: "task_automation_started";
        data: TaskAutomationStartedData;
      }
    | {
        type: "task_automation_progress";
        data: TaskAutomationProgressData;
      }
    | {
        type: "task_automation_completed";
        data: TaskAutomationCompletedData;
      }
    | {
        type: "task_automation_cancelled";
        data: TaskAutomationCancelledData;
      }
    | {
        type: "task_automation_error";
        data: TaskAutomationErrorData;
      }
  );

export interface ProjectChangedData {
  projectId: string;
  fileEventType: WatchEventType;
}

export interface SessionChangedData {
  projectId: string;
  sessionId: string;
  fileEventType: WatchEventType;
}

export interface TaskAutomationStartedData {
  taskId: string;
  sessionId: string;
  projectId: string;
}

export interface TaskAutomationProgressData {
  taskId: string;
  progress: TaskProgress;
  sessionId: string;
}

export interface TaskAutomationCompletedData {
  taskId: string;
  sessionId: string;
  projectId: string;
  finalProgress: TaskProgress;
  completionTime: Date;
}

export interface TaskAutomationCancelledData {
  taskId: string;
  sessionId: string;
  projectId: string;
}

export interface TaskAutomationErrorData {
  taskId: string;
  sessionId: string;
  error: AutomationError;
  retryCount: number;
}
