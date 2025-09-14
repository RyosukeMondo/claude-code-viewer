import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { aliveTasksAtom } from "../app/projects/[projectId]/sessions/[sessionId]/store/aliveTasksAtom";
import { projetsQueryConfig } from "../app/projects/hooks/useProjects";
import { honoClient } from "../lib/api/client";
import type { SSEEvent } from "../server/service/events/types";

type ParsedEvent = {
  event: string;
  data: SSEEvent;
  id: string;
};

const parseSSEEvent = (text: string): ParsedEvent => {
  const lines = text.split("\n").filter((line) => line.length > 0);

  let event = "";
  let data = "";
  let id = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      const dataLine = line.slice("data:".length).trim();
      data = data ? `${data}\n${dataLine}` : dataLine;
    } else if (line.startsWith("id:")) {
      id = line.slice("id:".length).trim();
    }
  }

  if (!event || !data || !id) {
    console.error("Incomplete SSE event:", { event, data, id, text });
    throw new Error(`Failed to parse SSE event: missing required fields`);
  }

  let parsedData: SSEEvent;
  try {
    parsedData = JSON.parse(data) as SSEEvent;
  } catch (parseError) {
    console.error("Failed to parse SSE data as JSON:", { data, parseError });
    throw new Error(
      `Failed to parse SSE event data: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
    );
  }

  return {
    id,
    event,
    data: parsedData,
  };
};

const parseSSEEvents = (text: string): ParsedEvent[] => {
  const eventTexts = text
    .split("\n\n")
    .filter((eventText) => eventText.length > 0);

  return eventTexts.map((eventText) => parseSSEEvent(eventText));
};

let isInitialized = false;

export const useServerEvents = () => {
  const queryClient = useQueryClient();
  const setAliveTasks = useSetAtom(aliveTasksAtom);
  const router = useRouter();

  const listener = useCallback(
    async (retryCount = 0, controller?: AbortController) => {
      const maxRetries = 5;
      const baseDelay = 1000;
      const maxDelay = 30000; // 30 seconds max
      const retryDelay = Math.min(baseDelay * 2 ** retryCount, maxDelay);

      // Circuit breaker: stop after max retries
      if (retryCount >= maxRetries) {
        console.error(
          `[SSE] Circuit breaker activated: Maximum retry attempts (${maxRetries}) reached.`,
        );
        return;
      }

      const abortController = controller || new AbortController();

      try {
        console.log(
          `[SSE] Connecting to event stream (attempt ${retryCount + 1}/${maxRetries})`,
        );

        const response = await honoClient.api.events.state_changes.$get();

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Response body is not readable");
        }

        console.log("[SSE] Connected successfully, listening for events...");
        const decoder = new TextDecoder();
        let buffer = "";

        while (!abortController.signal.aborted) {
          const { done, value } = await reader.read();

          if (done) {
            console.log("[SSE] Stream ended by server");
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = parseSSEEvents(buffer);

          // Reset buffer after successful parsing
          buffer = "";

          for (const event of events) {
            if (abortController.signal.aborted) break;

            console.log("[SSE] Event received:", event.data.type, event.data);

            try {
              if (event.data.type === "project_changed") {
                await queryClient.invalidateQueries({
                  queryKey: projetsQueryConfig.queryKey,
                });
              }

              if (event.data.type === "session_changed") {
                await queryClient.invalidateQueries({ queryKey: ["sessions"] });
              }

              if (event.data.type === "task_changed") {
                setAliveTasks(event.data.data);
              }

              if (event.data.type === "navigate_to_project") {
                console.log(
                  `[SSE] Navigate to project event received:`,
                  event.data.data,
                );

                const { projectId } = event.data.data;
                console.log(
                  `[SSE] Navigating to project page for manual continuation`,
                );

                // Use window.location for more reliable navigation with fallback
                try {
                  window.location.href = `/projects/${projectId}`;
                } catch (error) {
                  console.error(
                    `[SSE] Navigation to project failed, trying router fallback:`,
                    error,
                  );
                  router.push(`/projects/${projectId}`);
                }
              }

              if (event.data.type === "navigate_to_session") {
                console.log(
                  `[SSE] Navigate to session event received:`,
                  event.data.data,
                );

                const { projectId, sessionId, userMessageId } = event.data.data;
                console.log(
                  `[SSE] Auto-continue successful, navigating to new session: ${sessionId}`,
                );

                // Use window.location for more reliable navigation with fallback
                try {
                  const newUrl = `/projects/${projectId}/sessions/${sessionId}#message-${userMessageId}`;
                  console.log(`[SSE] Navigating to: ${newUrl}`);
                  window.location.href = newUrl;
                } catch (error) {
                  console.error(
                    `[SSE] Navigation to session failed, trying router fallback:`,
                    error,
                  );
                  const fallbackUrl = `/projects/${projectId}/sessions/${sessionId}`;
                  router.push(fallbackUrl);
                  // Try to scroll to message after navigation settles
                  setTimeout(() => {
                    const messageElement = document.getElementById(
                      `message-${userMessageId}`,
                    );
                    if (messageElement) {
                      messageElement.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }
                  }, 1000);
                }
              }
            } catch (eventError) {
              console.error("[SSE] Error processing event:", eventError, event);
            }
          }
        }

        reader.releaseLock();
      } catch (error) {
        console.error(
          `[SSE] Connection error (attempt ${retryCount + 1}):`,
          error,
        );

        // Don't retry on abort signal
        if (abortController.signal.aborted) {
          console.log("[SSE] Connection aborted, not retrying");
          return;
        }

        // Retry with exponential backoff
        console.log(`[SSE] Retrying connection in ${retryDelay}ms...`);
        setTimeout(() => {
          void listener(retryCount + 1, abortController);
        }, retryDelay);
      }
    },
    [queryClient, setAliveTasks, router],
  );

  useEffect(() => {
    if (isInitialized === false) {
      console.log("initializing SSE listener with fallback mechanisms");
      void listener()
        .then(() => {
          console.log("registered events listener with retry capability");
          isInitialized = true;
        })
        .catch((error) => {
          console.error("failed to register events listener", error);
          isInitialized = true;
        });
    }
  }, [listener]);
};
