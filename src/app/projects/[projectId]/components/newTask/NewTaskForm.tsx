import { AlertCircleIcon, CheckIcon } from "lucide-react";
import { type FC, useId, useState } from "react";
import { z } from "zod";
import { Button } from "../../../../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../components/ui/select";
import { Textarea } from "../../../../../components/ui/textarea";

// Task configuration schema for validation
const TaskConfigSchema = z.object({
  prompt: z
    .string()
    .min(10, "Prompt must be at least 10 characters long")
    .max(2000, "Prompt cannot exceed 2000 characters"),
  completionCondition: z
    .literal("spec-workflow")
    .refine((val) => val === "spec-workflow", {
      message: "Only spec-workflow completion is supported",
    }),
});

type TaskConfig = z.infer<typeof TaskConfigSchema>;

interface ValidationError {
  field: keyof TaskConfig;
  message: string;
}

export interface NewTaskFormProps {
  projectId: string;
  onSubmit: (config: TaskConfig) => Promise<void>;
  isPending?: boolean;
  error?: Error | null;
}

export const NewTaskForm: FC<NewTaskFormProps> = ({
  onSubmit,
  isPending = false,
  error,
}) => {
  const [prompt, setPrompt] = useState("");
  const [completionCondition, setCompletionCondition] = useState<string>("");
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );

  // Generate unique IDs for form elements
  const promptId = useId();
  const promptHelpId = useId();
  const promptErrorId = useId();
  const conditionId = useId();
  const conditionHelpId = useId();
  const conditionErrorId = useId();

  const handleSubmit = async () => {
    // Clear previous validation errors
    setValidationErrors([]);

    // Create the task config object
    const taskConfig = {
      prompt: prompt.trim(),
      completionCondition,
    };

    // Validate the config
    const validation = TaskConfigSchema.safeParse(taskConfig);

    if (!validation.success) {
      // Extract and set validation errors
      const errors: ValidationError[] = validation.error.issues.map((err) => ({
        field: err.path[0] as keyof TaskConfig,
        message: err.message,
      }));
      setValidationErrors(errors);
      return;
    }

    // Submit the validated config
    try {
      await onSubmit(validation.data);
    } catch (error) {
      // Handle submission errors - they will be displayed via the error prop
      console.error("Failed to submit task configuration:", error);
    }
  };

  const getFieldError = (field: keyof TaskConfig) => {
    return validationErrors.find((error) => error.field === field);
  };

  const isFormValid = () => {
    return (
      prompt.trim().length >= 10 &&
      prompt.trim().length <= 2000 &&
      completionCondition === "spec-workflow"
    );
  };

  return (
    <div className="space-y-6">
      {/* Display submission errors */}
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircleIcon className="w-4 h-4" />
          <span>Failed to create task. Please try again.</span>
        </div>
      )}

      {/* Predefined Prompt Input */}
      <div className="space-y-2">
        <label htmlFor={promptId} className="text-sm font-medium leading-none">
          Predefined Prompt <span className="text-destructive">*</span>
        </label>
        <Textarea
          id={promptId}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter the prompt that will be sent to Claude for each task iteration..."
          className="min-h-[120px] resize-none"
          disabled={isPending}
          maxLength={2000}
          aria-describedby={`${promptHelpId} ${getFieldError("prompt") ? promptErrorId : ""}`}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span id={promptHelpId}>
            This prompt will be used to start each automated task session
          </span>
          <span className={prompt.length > 1800 ? "text-destructive" : ""}>
            {prompt.length}/2000 characters
          </span>
        </div>
        {getFieldError("prompt") && (
          <div
            id={promptErrorId}
            className="text-sm text-destructive flex items-center gap-1"
          >
            <AlertCircleIcon className="w-3 h-3" />
            {getFieldError("prompt")?.message}
          </div>
        )}
      </div>

      {/* Completion Condition Selection */}
      <div className="space-y-2">
        <label
          htmlFor={conditionId}
          className="text-sm font-medium leading-none"
        >
          Completion Condition <span className="text-destructive">*</span>
        </label>
        <Select
          value={completionCondition}
          onValueChange={setCompletionCondition}
          disabled={isPending}
        >
          <SelectTrigger
            id={conditionId}
            aria-describedby={`${conditionHelpId} ${getFieldError("completionCondition") ? conditionErrorId : ""}`}
          >
            <SelectValue placeholder="Select when to stop task execution" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="spec-workflow">
              <div className="flex items-center gap-2">
                <CheckIcon className="w-4 h-4" />
                <div>
                  <div className="font-medium">
                    Spec-Workflow Task Completion
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Stop when all spec-workflow tasks are completed
                  </div>
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <div id={conditionHelpId} className="text-xs text-muted-foreground">
          The system will monitor task progress and continue until this
          condition is met
        </div>
        {getFieldError("completionCondition") && (
          <div
            id={conditionErrorId}
            className="text-sm text-destructive flex items-center gap-1"
          >
            <AlertCircleIcon className="w-3 h-3" />
            {getFieldError("completionCondition")?.message}
          </div>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-xs text-muted-foreground">
          {validationErrors.length > 0 && (
            <span className="text-destructive">
              Please fix {validationErrors.length} validation error
              {validationErrors.length > 1 ? "s" : ""} above
            </span>
          )}
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!isFormValid() || isPending}
          size="lg"
          className="gap-2"
        >
          {isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
              Creating Task...
            </>
          ) : (
            <>
              <CheckIcon className="w-4 h-4" />
              Create Task
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
