"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Square,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { honoClient } from "@/lib/api/client";
import type { TaskConfig, TaskProgress, TaskStatus } from "@/lib/types/task";
import type { SSEEvent } from "@/server/service/events/types";

interface TaskStatusDisplayProps {
  projectId: string;
  taskConfig?: TaskConfig;
  onCancel?: () => void;
}

const parseSSEEvent = (text: string) => {
  const lines = text.split("\n");
  const eventIndex = lines.findIndex((line) => line.startsWith("event:"));
  const dataIndex = lines.findIndex((line) => line.startsWith("data:"));
  const idIndex = lines.findIndex((line) => line.startsWith("id:"));

  const endIndex = (index: number) => {
    const targets = [eventIndex, dataIndex, idIndex, lines.length].filter(
      (current) => current > index,
    );
    return Math.min(...targets);
  };

  if (eventIndex === -1 || dataIndex === -1 || idIndex === -1) {
    throw new Error("Failed to parse SSE event");
  }

  const event = lines.slice(eventIndex, endIndex(eventIndex)).join("\n");
  const data = lines.slice(dataIndex, endIndex(dataIndex)).join("\n");
  const id = lines.slice(idIndex, endIndex(idIndex)).join("\n");

  return {
    id: id.slice("id:".length).trim(),
    event: event.slice("event:".length).trim(),
    data: JSON.parse(
      data.slice(data.indexOf("{"), data.lastIndexOf("}") + 1),
    ) as SSEEvent,
  };
};

const parseSSEEvents = (text: string) => {
  const eventTexts = text
    .split("\n\n")
    .filter((eventText) => eventText.length > 0);

  return eventTexts.map((eventText) => parseSSEEvent(eventText));
};

const getStatusIcon = (status: TaskStatus) => {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "cancelled":
      return <Square className="h-4 w-4 text-yellow-600" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-600" />;
    default:
      return <AlertTriangle className="h-4 w-4" />;
  }
};

const getStatusColor = (
  status: TaskStatus,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "pending":
      return "outline";
    case "running":
      return "default";
    case "completed":
      return "secondary";
    case "cancelled":
      return "outline";
    case "error":
      return "destructive";
    default:
      return "outline";
  }
};

const formatStatus = (status: TaskStatus): string => {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
};

export function TaskStatusDisplay({
  projectId,
  taskConfig,
  onCancel,
}: TaskStatusDisplayProps) {
  const [currentStatus, setCurrentStatus] = useState<TaskStatus>(
    taskConfig?.status || "pending",
  );
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Subscribe to task automation events via SSE
  const subscribeToEvents = useCallback(async () => {
    if (!taskConfig?.id) return;

    try {
      const response = await honoClient.api.events.state_changes.$get();

      if (!response.ok) {
        throw new Error("Failed to connect to event stream");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get stream reader");
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const events = parseSSEEvents(decoder.decode(value));

        for (const event of events) {
          const { data: eventData } = event;

          // Handle task automation events with proper type guards
          switch (eventData.type) {
            case "task_automation_started":
              if (
                "data" in eventData &&
                eventData.data.taskId === taskConfig.id
              ) {
                const data = eventData.data;
                setCurrentStatus("running");
                setSessionId(data.sessionId);
                setError(null);
              }
              break;

            case "task_automation_progress":
              if (
                "data" in eventData &&
                eventData.data.taskId === taskConfig.id
              ) {
                const data = eventData.data;
                setProgress(data.progress);
                setCurrentStatus("running");
              }
              break;

            case "task_automation_completed":
              if (
                "data" in eventData &&
                eventData.data.taskId === taskConfig.id
              ) {
                const data = eventData.data;
                setCurrentStatus("completed");
                setProgress(data.finalProgress);
                setError(null);
              }
              break;

            case "task_automation_cancelled":
              if (
                "data" in eventData &&
                eventData.data.taskId === taskConfig.id
              ) {
                setCurrentStatus("cancelled");
                setError(null);
              }
              break;

            case "task_automation_error":
              if (
                "data" in eventData &&
                eventData.data.taskId === taskConfig.id
              ) {
                const data = eventData.data;
                setCurrentStatus("error");
                setError(
                  data.error.message ||
                    "An error occurred during task execution",
                );
              }
              break;
          }

          // Invalidate related queries on task automation status changes
          if (eventData.type.startsWith("task_automation_")) {
            await queryClient.invalidateQueries({
              queryKey: ["tasks", projectId],
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to subscribe to task events:", err);
      setError("Failed to connect to real-time updates");
    }
  }, [taskConfig?.id, projectId, queryClient]);

  useEffect(() => {
    if (
      taskConfig &&
      (currentStatus === "running" || currentStatus === "pending")
    ) {
      subscribeToEvents();
    }
  }, [taskConfig, currentStatus, subscribeToEvents]);

  if (!taskConfig) {
    return null;
  }

  const progressPercentage = progress
    ? (progress.completedTasks / progress.totalTasks) * 100
    : 0;
  const isActive = currentStatus === "running" || currentStatus === "pending";

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(currentStatus)}
            <CardTitle className="text-lg">Task Automation</CardTitle>
            <Badge variant={getStatusColor(currentStatus)}>
              {formatStatus(currentStatus)}
            </Badge>
          </div>
          {isActive && onCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-destructive hover:text-destructive"
            >
              <Square className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          )}
        </div>
        <CardDescription className="line-clamp-2">
          {taskConfig.prompt}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Section */}
        {progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Progress</span>
              <span>
                {progress.completedTasks} of {progress.totalTasks} tasks
                completed
              </span>
            </div>
            <Progress value={progressPercentage} max={100} className="h-3" />
            {sessionId && (
              <div className="text-xs text-muted-foreground">
                Current session: {sessionId.slice(0, 8)}...
              </div>
            )}
          </div>
        )}

        {/* Status Messages */}
        {currentStatus === "running" && !progress && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Starting task automation...</span>
          </div>
        )}

        {currentStatus === "pending" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Play className="h-3 w-3" />
            <span>Task is queued to start</span>
          </div>
        )}

        {currentStatus === "completed" && progress && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Task Completed</AlertTitle>
            <AlertDescription>
              All {progress.totalTasks} tasks have been completed successfully.
            </AlertDescription>
          </Alert>
        )}

        {currentStatus === "cancelled" && (
          <Alert>
            <Square className="h-4 w-4" />
            <AlertTitle>Task Cancelled</AlertTitle>
            <AlertDescription>
              Task automation was cancelled by user request.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Task Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Task Details */}
        <div className="space-y-2 text-xs text-muted-foreground border-t pt-3">
          <div>
            <span className="font-medium">Created:</span>{" "}
            {taskConfig.createdAt.toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Completion condition:</span>{" "}
            {taskConfig.completionCondition}
          </div>
          {progress && (
            <div>
              <span className="font-medium">Last updated:</span>{" "}
              {progress.lastUpdated.toLocaleString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
