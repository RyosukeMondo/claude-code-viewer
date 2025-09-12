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
    console.error("failed", text);
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
    async (retryCount = 0) => {
      const maxRetries = 3;
      const retryDelay = Math.min(1000 * 2 ** retryCount, 10000); // Exponential backoff, max 10s

      try {
        console.log(`listening to events (attempt ${retryCount + 1})`);
        const response = await honoClient.api.events.state_changes.$get();

        if (!response.ok) {
          throw new Error(
            `Failed to fetch events: ${response.status} ${response.statusText}`,
          );
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Failed to get reader");
        }

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const events = parseSSEEvents(decoder.decode(value));

          for (const event of events) {
            console.log("[SSE] Event received:", event.data.type, event.data);

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
          }
        }
      } catch (error) {
        console.error(
          `[SSE] Connection error (attempt ${retryCount + 1}):`,
          error,
        );

        // Retry with exponential backoff if retries remain
        if (retryCount < maxRetries) {
          console.log(`[SSE] Retrying connection in ${retryDelay}ms...`);
          setTimeout(() => {
            void listener(retryCount + 1);
          }, retryDelay);
        } else {
          console.error(
            `[SSE] Maximum retry attempts (${maxRetries}) reached. Connection failed.`,
          );
          // Could implement a UI notification here for persistent connection failures
        }
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
