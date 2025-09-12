import { CheckSquareIcon, PlusIcon } from "lucide-react";
import { type FC, type ReactNode, useState } from "react";
import { Button } from "../../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../../../components/ui/dialog";
import { NewTask } from "./NewTask";

export const NewTaskModal: FC<{
  projectId: string;
  trigger?: ReactNode;
  initialMessage?: string;
}> = ({ projectId, trigger, initialMessage }) => {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-2">
            <PlusIcon className="w-4 h-4" />
            New Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[95vw] md:w-[80vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquareIcon className="w-5 h-5" />
            Create New Task
          </DialogTitle>
        </DialogHeader>
        <NewTask
          projectId={projectId}
          onSuccess={handleSuccess}
          initialMessage={initialMessage}
        />
      </DialogContent>
    </Dialog>
  );
};
