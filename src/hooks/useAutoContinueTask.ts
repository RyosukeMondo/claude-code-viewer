import { useEffect } from "react";
import { honoClient } from "../lib/api/client";
import type { NavigateToProjectData } from "../server/service/events/types";

/**
 * Hook to handle automatic task continuation when autoContinue is enabled
 */
export const useAutoContinueTask = () => {
  useEffect(() => {
    const handleAutoContinue = async (event: Event) => {
      const customEvent = event as CustomEvent<NavigateToProjectData>;
      const { projectId, originalPrompt, autoContinue } = customEvent.detail;

      if (!autoContinue || !originalPrompt) {
        return;
      }

      try {
        console.log(
          `[Auto-Continue] Starting new task for project ${projectId}`,
        );

        // Start a new task with the original prompt and autoContinue enabled
        const response = await honoClient.api.projects[
          ":projectId"
        ].tasks.start.$post(
          {
            param: { projectId },
            json: {
              prompt: originalPrompt,
              completionCondition: "spec-workflow",
              autoContinue: true,
            },
          },
          {
            init: {
              signal: AbortSignal.timeout(20 * 1000),
            },
          },
        );

        if (response.ok) {
          const result = await response.json();
          console.log(
            `[Auto-Continue] New task started: ${result.taskId}, session: ${result.sessionId}`,
          );

          // Navigate to the new session
          window.location.href = `/projects/${projectId}/sessions/${result.sessionId}#message-${result.userMessageId}`;
        } else {
          console.error(
            "[Auto-Continue] Failed to start new task:",
            response.statusText,
          );
          // Fallback to manual navigation
          window.location.href = `/projects/${projectId}`;
        }
      } catch (error) {
        console.error("[Auto-Continue] Error starting new task:", error);
        // Fallback to manual navigation
        window.location.href = `/projects/${projectId}`;
      }
    };

    // Listen for the custom auto-continue event
    window.addEventListener("auto-continue-task", handleAutoContinue);

    return () => {
      window.removeEventListener("auto-continue-task", handleAutoContinue);
    };
  }, []);
};
