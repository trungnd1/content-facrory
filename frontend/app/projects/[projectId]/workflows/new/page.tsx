import { redirect } from "next/navigation";

interface NewWorkflowPageProps {
  params: {
    projectId: string;
  };
}

export const dynamic = "force-dynamic";

export default function NewWorkflowPage({ params }: NewWorkflowPageProps) {
  redirect(`/workflows?projectId=${params.projectId}`);
}
