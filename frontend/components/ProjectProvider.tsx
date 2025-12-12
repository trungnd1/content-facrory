"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type CurrentProject = {
  id: string;
  name: string;
} | null;

interface ProjectContextValue {
  currentProject: CurrentProject;
  setCurrentProject: (project: CurrentProject) => void;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

const STORAGE_KEY = "cf_current_project";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [currentProject, setCurrentProjectState] = useState<CurrentProject>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CurrentProject;
      if (parsed && typeof parsed.id === "string") {
        setCurrentProjectState({ id: parsed.id, name: parsed.name ?? "Project" });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!currentProject) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentProject));
      }
    } catch {
      // ignore
    }
  }, [currentProject]);

  const setCurrentProject = (project: CurrentProject) => {
    setCurrentProjectState(project);
  };

  return (
    <ProjectContext.Provider value={{ currentProject, setCurrentProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return ctx;
}
