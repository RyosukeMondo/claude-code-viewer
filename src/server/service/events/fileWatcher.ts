import { type FSWatcher, type WatchEventType, watch } from "node:fs";
import z from "zod";
import { claudeProjectPath } from "../paths";
import { type EventBus, getEventBus } from "./EventBus";

const fileRegExp = /(?<projectId>.*?)\/(?<sessionId>.*?)\.jsonl/;
const fileRegExpGroupSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
});

export class FileWatcherService {
  private watcher: FSWatcher | null = null;
  private projectWatchers: Map<string, FSWatcher> = new Map();
  private eventBus: EventBus;
  private isWatching = false;

  constructor() {
    this.eventBus = getEventBus();

    // Cleanup on process termination
    const cleanup = () => {
      this.stop();
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("exit", cleanup);
  }

  public startWatching(): void {
    if (this.isWatching) {
      console.log("File watcher already running");
      return;
    }

    try {
      console.log("Starting file watcher on:", claudeProjectPath);

      this.watcher = watch(
        claudeProjectPath,
        { persistent: false, recursive: true },
        (eventType, filename) => {
          this.handleFileEvent(eventType, filename);
        },
      );

      this.watcher.on("error", (error) => {
        console.error("File watcher error:", error);
        this.handleWatcherError(error);
      });

      this.isWatching = true;
      console.log("File watcher initialization completed");
    } catch (error) {
      console.error("Failed to start file watching:", error);
      this.isWatching = false;
    }
  }

  private handleFileEvent(
    eventType: WatchEventType,
    filename: string | null,
  ): void {
    if (!filename) return;

    try {
      const groups = fileRegExpGroupSchema.safeParse(
        filename.match(fileRegExp)?.groups,
      );

      if (!groups.success) return;

      const { projectId, sessionId } = groups.data;

      this.eventBus.emit("project_changed", {
        type: "project_changed",
        data: {
          fileEventType: eventType,
          projectId,
        },
      });

      this.eventBus.emit("session_changed", {
        type: "session_changed",
        data: {
          projectId,
          sessionId,
          fileEventType: eventType,
        },
      });
    } catch (error) {
      console.error("Error processing file event:", error, {
        eventType,
        filename,
      });
    }
  }

  private handleWatcherError(error: Error): void {
    console.error("File watcher encountered an error:", error);
    this.stop();

    // Attempt to restart after a delay
    setTimeout(() => {
      if (!this.isWatching) {
        console.log("Attempting to restart file watcher...");
        this.startWatching();
      }
    }, 5000);
  }

  public stop(): void {
    console.log("Stopping file watcher service");

    if (this.watcher) {
      try {
        this.watcher.close();
        this.watcher = null;
      } catch (error) {
        console.error("Error closing main watcher:", error);
      }
    }

    for (const [projectId, watcher] of this.projectWatchers) {
      try {
        watcher.close();
      } catch (error) {
        console.error(`Error closing project watcher for ${projectId}:`, error);
      }
    }
    this.projectWatchers.clear();

    this.isWatching = false;
    console.log("File watcher service stopped");
  }

  public isActive(): boolean {
    return this.isWatching && this.watcher !== null;
  }
}

// Singleton instance management
let watcherInstance: FileWatcherService | null = null;

export const getFileWatcher = (): FileWatcherService => {
  if (!watcherInstance) {
    console.log("Creating new FileWatcher instance");
    watcherInstance = new FileWatcherService();
  }
  return watcherInstance;
};

export const destroyFileWatcher = (): void => {
  if (watcherInstance) {
    console.log("Destroying FileWatcher instance");
    watcherInstance.stop();
    watcherInstance = null;
  }
};

// Export for testing/debugging
export const getFileWatcherStatus = (): {
  exists: boolean;
  isActive: boolean;
} => {
  return {
    exists: watcherInstance !== null,
    isActive: watcherInstance?.isActive() ?? false,
  };
};
