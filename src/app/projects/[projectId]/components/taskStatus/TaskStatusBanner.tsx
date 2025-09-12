"use client";

import { Clock, Loader2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TaskStatusBannerProps {
  sessionId: string;
  isRunningTask: boolean;
  isPausedTask: boolean;
  onAbort?: () => void;
}

const getStatusIcon = (status: "running" | "paused" | "idle") => {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    case "paused":
      return <Clock className="h-4 w-4 text-yellow-600" />;
    default:
      return null;
  }
};

const getStatusColor = (
  status: "running" | "paused" | "idle",
): "default" | "secondary" | "outline" => {
  switch (status) {
    case "running":
      return "default";
    case "paused":
      return "outline";
    default:
      return "secondary";
  }
};

export function TaskStatusBanner({
  sessionId,
  isRunningTask,
  isPausedTask,
  onAbort,
}: TaskStatusBannerProps) {
  const status = isRunningTask ? "running" : isPausedTask ? "paused" : "idle";

  if (status === "idle") {
    return null;
  }

  return (
    <Alert className="mb-4 border-primary/20 bg-primary/5">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3 flex-1">
          {getStatusIcon(status)}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">
                Task {status === "running" ? "Running" : "Paused"}
              </span>
              <Badge
                variant={getStatusColor(status)}
                className="text-xs px-2 py-0"
              >
                {status === "running" ? "Active" : "Waiting"}
              </Badge>
            </div>
            <AlertDescription className="text-xs text-muted-foreground">
              Session: {sessionId.slice(0, 12)}...
              {status === "running" &&
                " • Claude Code is processing your request"}
              {status === "paused" && " • Task is paused and waiting for input"}
            </AlertDescription>
          </div>
        </div>

        {onAbort && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAbort}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-4"
          >
            <XCircle className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Abort</span>
          </Button>
        )}
      </div>
    </Alert>
  );
}
