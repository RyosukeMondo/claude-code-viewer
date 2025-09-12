import { useAtom } from "jotai";
import type { FC } from "react";
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { taskPreferencesAtom } from "@/lib/atoms/taskAtoms";
import { ChatInput } from "../chatForm";
import { useStartTaskMutation } from "./useTaskMutations";

export const NewTask: FC<{
  projectId: string;
  onSuccess?: () => void;
  initialMessage?: string;
}> = ({ projectId, onSuccess, initialMessage }) => {
  const checkboxId = useId();
  const [taskPreferences, setTaskPreferences] = useAtom(taskPreferencesAtom);
  const startNewTask = useStartTaskMutation(projectId, () => {
    onSuccess?.();
  });

  const handleSubmit = async (message: string) => {
    await startNewTask.mutateAsync({
      prompt: message,
      completionCondition: "spec-workflow",
      autoContinue: taskPreferences.autoContinueSpecWorkflow,
    });
  };

  return (
    <div className="space-y-4">
      <ChatInput
        projectId={projectId}
        onSubmit={handleSubmit}
        isPending={startNewTask.isPending}
        error={startNewTask.error}
        placeholder="Describe the automated task you want to create... (Start with / for commands, @ for files, Shift+Enter to send)"
        buttonText="Create Task"
        minHeight="min-h-[200px]"
        containerClassName="space-y-4"
        initialValue={initialMessage}
      />

      <div className="flex items-center space-x-2">
        <Checkbox
          id={checkboxId}
          checked={taskPreferences.autoContinueSpecWorkflow}
          onCheckedChange={(checked) =>
            setTaskPreferences((prev) => ({
              ...prev,
              autoContinueSpecWorkflow: !!checked,
            }))
          }
        />
        <label
          htmlFor={checkboxId}
          className="text-sm font-medium cursor-pointer"
        >
          Auto-continue when spec workflow is incomplete
        </label>
      </div>
    </div>
  );
};
