import type { FC } from "react";
import { ChatInput, useNewChatMutation } from "../chatForm";

export const NewTask: FC<{
  projectId: string;
  onSuccess?: () => void;
}> = ({ projectId, onSuccess }) => {
  const startNewTask = useNewChatMutation(projectId, onSuccess);

  const handleSubmit = async (message: string) => {
    await startNewTask.mutateAsync({ message });
  };

  return (
    <ChatInput
      projectId={projectId}
      onSubmit={handleSubmit}
      isPending={startNewTask.isPending}
      error={startNewTask.error}
      placeholder="Describe the automated task you want to create... (Start with / for commands, @ for files, Shift+Enter to send)"
      buttonText="Create Task"
      minHeight="min-h-[200px]"
      containerClassName="space-y-4"
    />
  );
};
