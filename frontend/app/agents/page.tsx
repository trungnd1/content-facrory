import { listAgents } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { AgentsClient } from "./AgentsClient";
import { ProjectSelectorBar } from "@/components/ProjectSelectorBar";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await listAgents().catch(() => []);

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar active="agents" />

      {/* Main content layout aligned with /workflows */}
      <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark">
        <div className="flex h-full grow flex-col">
          <div className="px-6 md:px-12 flex flex-1 justify-center py-8">
            <div className="flex flex-col max-w-[1200px] flex-1 gap-6">
              <ProjectSelectorBar />
              <AgentsClient initialAgents={agents} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
