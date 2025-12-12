import { getWorkflow } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { WorkflowDesignClient } from "./WorkflowDesignClient";

export const dynamic = "force-dynamic";

interface Props {
  params: { workflowId: string };
}

export default async function WorkflowDesignPage({ params }: Props) {
  const { workflowId } = params;
  const workflow = await getWorkflow(workflowId).catch(() => null);

  return (
    <div className="h-screen flex overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar active="workflows" />
      <div className="flex-1 flex flex-col h-full">
        <WorkflowDesignClient workflow={workflow} />
      </div>
    </div>
  );
}
