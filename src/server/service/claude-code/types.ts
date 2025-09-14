import type { MessageGenerator, OnMessage } from "./createMessageGenerator";

type BaseClaudeCodeTask = {
  id: string;
  projectId: string;
  baseSessionId?: string | undefined; // undefined = new session
  cwd: string;
  completionCondition?: "spec-workflow" | "manual" | undefined; // completion condition for automatic continuation
  originalPrompt?: string; // store original user prompt for session continuation
  autoContinue?: boolean; // whether to automatically continue when workflow is incomplete
  lastActivity: number; // timestamp of last message activity
  generateMessages: MessageGenerator;
  setNextMessage: (message: string) => void;
  resolveFirstMessage: () => void;
  setFirstMessagePromise: () => void;
  awaitFirstMessage: () => Promise<void>;
  onMessageHandlers: OnMessage[];
};

export type PendingClaudeCodeTask = BaseClaudeCodeTask & {
  status: "pending";
};

export type RunningClaudeCodeTask = BaseClaudeCodeTask & {
  status: "running";
  sessionId: string;
  userMessageId: string;
  abortController: AbortController;
};

export type PausedClaudeCodeTask = BaseClaudeCodeTask & {
  status: "paused";
  sessionId: string;
  userMessageId: string;
  abortController: AbortController;
};

type CompletedClaudeCodeTask = BaseClaudeCodeTask & {
  status: "completed";
  sessionId: string;
  userMessageId: string;
  abortController: AbortController;
  resolveFirstMessage: () => void;
};

type FailedClaudeCodeTask = BaseClaudeCodeTask & {
  status: "failed";
  sessionId?: string;
  userMessageId?: string;
  abortController?: AbortController;
};

export type ClaudeCodeTask =
  | RunningClaudeCodeTask
  | PausedClaudeCodeTask
  | CompletedClaudeCodeTask
  | FailedClaudeCodeTask;

export type AliveClaudeCodeTask = RunningClaudeCodeTask | PausedClaudeCodeTask;

export type SerializableAliveTask = Pick<
  AliveClaudeCodeTask,
  | "id"
  | "status"
  | "sessionId"
  | "userMessageId"
  | "completionCondition"
  | "originalPrompt"
  | "autoContinue"
  | "lastActivity"
>;

export type TaskSessionConfig = {
  cwd: string;
  projectId: string;
  sessionId?: string;
  completionCondition?: "spec-workflow" | "manual" | undefined;
  autoContinue?: boolean;
};
