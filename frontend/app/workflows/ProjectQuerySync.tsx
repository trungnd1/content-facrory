"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useProject } from "@/components/ProjectProvider";
import { getProject } from "@/lib/api";

export function ProjectQuerySync() {
  const searchParams = useSearchParams();
  const { currentProject, setCurrentProject } = useProject();

  useEffect(() => {
    const projectId = searchParams.get("projectId");
    if (!projectId) return;
    if (currentProject?.id === projectId) return;

    let cancelled = false;

    getProject(projectId)
      .then((p) => {
        if (cancelled) return;
        setCurrentProject({ id: p.id, name: p.name });
      })
      .catch(() => {
        // ignore invalid projectId
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, currentProject?.id, setCurrentProject]);

  return null;
}
