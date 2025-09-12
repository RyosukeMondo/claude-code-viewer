"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  ExternalLinkIcon,
  Loader2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { honoClient } from "@/lib/api/client";
import { NewTaskModal } from "../newTask/NewTaskModal";
import { useAbortTaskMutation } from "../newTask/useTaskMutations";

interface ActiveTasksListProps {
  projectId: string;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    case "paused":
      return <Clock className="h-4 w-4 text-yellow-600" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    default:
      return <XCircle className="h-4 w-4 text-gray-400" />;
  }
};

const getStatusColor = (
  status: string,
): "default" | "secondary" | "outline" | "destructive" => {
  switch (status) {
    case "running":
      return "default";
    case "paused":
      return "outline";
    case "completed":
      return "secondary";
    default:
      return "destructive";
  }
};

export function ActiveTasksList({ projectId }: ActiveTasksListProps) {
  const abortTaskMutation = useAbortTaskMutation();

  const { data, error, isLoading } = useQuery({
    queryKey: ["aliveTasks"],
    queryFn: async () => {
      const response = await honoClient.api.tasks.alive.$get();
      if (!response.ok) {
        throw new Error("Failed to fetch active tasks");
      }
      return response.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const activeTasks = data?.aliveTasks || [];
  const projectTasks = activeTasks.filter(
    (task) => task.sessionId, // We can add projectId filtering later when available in API
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Active Tasks...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            Failed to Load Tasks
          </CardTitle>
          <CardDescription>
            Unable to fetch active task status. Please try refreshing the page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (projectTasks.length === 0) {
    return null; // Don't show empty state, just hide the component
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 text-blue-600" />
          Active Tasks ({projectTasks.length})
        </CardTitle>
        <CardDescription>
          Currently running or paused task sessions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {projectTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {getStatusIcon(task.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant={getStatusColor(task.status)}
                    className="text-xs px-2 py-0"
                  >
                    {task.status}
                  </Badge>
                  {task.completionCondition && (
                    <Badge variant="outline" className="text-xs px-2 py-0">
                      {task.completionCondition}
                    </Badge>
                  )}
                  <span className="text-sm font-mono text-muted-foreground truncate">
                    {task.sessionId.slice(0, 12)}...
                  </span>
                </div>
                {task.originalPrompt && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                    "{task.originalPrompt}"
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Session ID: {task.sessionId}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {task.status === "paused" &&
              task.completionCondition === "spec-workflow" &&
              task.originalPrompt ? (
                <NewTaskModal
                  projectId={projectId}
                  initialMessage={task.originalPrompt}
                  trigger={
                    <Button variant="default" size="sm" className="gap-1">
                      <Loader2 className="h-3 w-3" />
                      <span className="hidden sm:inline">Continue Task</span>
                      <span className="sm:hidden">Continue</span>
                    </Button>
                  }
                />
              ) : (
                <Button asChild variant="ghost" size="sm">
                  <Link
                    href={`/projects/${projectId}/sessions/${encodeURIComponent(task.sessionId)}`}
                    className="flex items-center gap-1"
                  >
                    <ExternalLinkIcon className="h-3 w-3" />
                    <span className="hidden sm:inline">View</span>
                  </Link>
                </Button>
              )}

              {(task.status === "running" || task.status === "paused") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    abortTaskMutation.mutate({ sessionId: task.sessionId })
                  }
                  disabled={abortTaskMutation.isPending}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">Abort</span>
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
