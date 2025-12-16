"use client";

import { ProjectSelectorBar } from "@/components/ProjectSelectorBar";
import { DashboardClient } from "./DashboardClient";

export function HomeClient() {
  return (
    <>
      <ProjectSelectorBar />
      <DashboardClient />
    </>
  );
}
