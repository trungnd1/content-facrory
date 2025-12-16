import { Sidebar } from "@/components/Sidebar";
import { ProjectSelectorBar } from "@/components/ProjectSelectorBar";
import { ExecutionsClient } from "./ExecutionsClient";

export const dynamic = "force-dynamic";

export default async function ExecutionsIndexPage() {
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar active="executions" />

      <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark">
        <div className="flex h-full grow flex-col">
          <div className="px-6 md:px-12 flex flex-1 justify-center py-8">
            <div className="flex flex-col max-w-[1200px] flex-1 gap-6">
              <ProjectSelectorBar />

              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-dark pb-6">
                <div className="flex flex-col gap-2">
                  <h1 className="text-white text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">
                    Executions
                  </h1>
                  <p className="text-[#9da1b9] text-base font-normal leading-normal">
                    Theo dõi trạng thái và kết quả của các lần chạy workflow.
                  </p>
                </div>
              </div>

              <ExecutionsClient />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
