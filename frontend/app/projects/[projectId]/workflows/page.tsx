import { redirect } from "next/navigation";

interface ProjectWorkflowsPageProps {
  params: {
    projectId: string;
  };
}

export const dynamic = "force-dynamic";

export default async function ProjectWorkflowsPage({ params }: ProjectWorkflowsPageProps) {
  redirect(`/workflows?projectId=${params.projectId}`);
}
