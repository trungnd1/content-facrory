"use client";

import { useEffect, useState } from "react";
import { listProjects, type Project } from "@/lib/api";
import { useProject } from "@/components/ProjectProvider";

interface ProjectSelectorBarProps {
  className?: string;
}

export function ProjectSelectorBar({ className = "" }: ProjectSelectorBarProps) {
  const { currentProject, setCurrentProject } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProjects()
      .then((items) => {
        if (!cancelled) setProjects(items ?? []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (value: string) => {
    if (!value) {
      setCurrentProject(null);
      return;
    }
    const project = projects.find((p) => p.id === value);
    if (!project) return;
    setCurrentProject({ id: project.id, name: project.name });
  };

  const selectedId = currentProject?.id ?? "";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border border-border-dark bg-surface-dark px-4 py-3 text-xs text-text-secondary ${className}`}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="uppercase tracking-[0.16em] text-[11px] text-text-secondary">
          Current project
        </span>
        <span className="text-sm font-medium text-white truncate">
          {currentProject?.name ?? "None selected"}
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-[180px]">
        <div className="relative w-full">
          <select
            className="w-full appearance-none group flex h-8 items-center justify-center gap-x-2 rounded-lg bg-[#282b39] hover:bg-[#3b3f54] border border-transparent hover:border-border-dark pl-3 pr-8 text-white text-xs font-medium transition-all focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:hover:bg-[#282b39]"
            value={selectedId}
            onChange={(e) => handleChange(e.target.value)}
            disabled={loading}
            aria-label="Project selection"
          >
            <option value="">Dự án: None</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {`Dự án: ${project.name}`}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-secondary text-[16px]">
            keyboard_arrow_down
          </span>
        </div>
      </div>
    </div>
  );
}
