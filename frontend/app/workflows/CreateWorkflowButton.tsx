"use client";

import { useRouter } from "next/navigation";
import { useProject } from "@/components/ProjectProvider";
import { createWorkflowForProject } from "@/lib/api";

export function CreateWorkflowButton() {
  const router = useRouter();
  const { currentProject } = useProject();

  const handleClick = async () => {
    if (!currentProject) {
      // For now, require selecting a project in the header first.
      // This avoids bouncing the user to the Projects page.
      alert("Please select a project in the header before creating a workflow.");
      return;
    }

    try {
      const wf = await createWorkflowForProject(currentProject.id, {
        name: "New Workflow",
        description: "",
      });

      router.push(`/workflows/${wf.id}/design`);
    } catch (error) {
      console.error("Failed to create workflow", error);
      alert("Không thể tạo workflow mới. Vui lòng thử lại.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center justify-center gap-2 rounded-lg h-10 px-5 bg-primary hover:bg-blue-700 transition-colors text-white text-sm font-bold leading-normal tracking-[0.015em] shadow-lg shadow-blue-900/20"
    >
      <span className="material-symbols-outlined text-[20px]">add</span>
      <span className="truncate">Tạo Workflow mới</span>
    </button>
  );
}
