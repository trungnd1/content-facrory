import { Sidebar } from "@/components/Sidebar";
import { listWorkflowsByProject, getProject } from "@/lib/api";
import Link from "next/link";
import { CreateWorkflowForProjectButton } from "./CreateWorkflowForProjectButton";

interface ProjectWorkflowsPageProps {
  params: {
    projectId: string;
  };
}

export const dynamic = "force-dynamic";

export default async function ProjectWorkflowsPage({ params }: ProjectWorkflowsPageProps) {
  const projectId = params.projectId;

  const [project, workflows] = await Promise.all([
    getProject(projectId).catch(() => null),
    listWorkflowsByProject(projectId).catch(() => []),
  ]);

  const projectName = project?.name ?? "Project";
  const projectDescription =
    project?.description ?? "Quản lý workflows và luồng xử lý nội dung cho project này.";

  return (
    <div className="flex h-screen w-full">
      <Sidebar active="projects" />

      <main className="flex flex-1 flex-col overflow-hidden bg-background-light dark:bg-background-dark relative">
        {/* Mobile top bar (same pattern as projects page) */}
        <div className="md:hidden flex items-center justify-between border-b border-[#282b39] bg-[#111218] px-4 py-3">
          <div className="flex items-center gap-3 text-white">
            <div className="size-8 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-3xl">auto_awesome</span>
            </div>
            <span className="font-bold">AI Studio</span>
          </div>
          <button className="text-[#9da1b9] hover:text-white">
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-[1200px] flex flex-col gap-6 w-full">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-[#9da1b9]">
                  <Link href="/projects" className="hover:text-white transition-colors">
                    Projects
                  </Link>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  <span className="truncate max-w-[180px] md:max-w-xs" title={projectName}>
                    {projectName}
                  </span>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                  <span>Workflows</span>
                </div>
                <h1 className="text-white text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">
                  Workflows
                </h1>
                <p className="text-[#9da1b9] text-base font-normal leading-normal">
                  {projectDescription}
                </p>
              </div>
              <CreateWorkflowForProjectButton projectId={projectId} />
            </div>

            {/* Toolbar similar to workflows list */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-[#15171e] border border-[#282b39] rounded-xl px-4 py-4">
              <div className="w-full lg:max-w-[360px]">
                <label className="flex flex-col h-10 w-full">
                  <div className="flex w-full flex-1 items-stretch rounded-lg h-full ring-1 ring-[#282b39] focus-within:ring-primary/50 transition-all">
                    <div className="text-[#9da1b9] flex border-none bg-[#1a1d24] items-center justify-center pl-3 rounded-l-lg">
                      <span className="material-symbols-outlined text-[20px]">search</span>
                    </div>
                    <input
                      className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-white focus:outline-0 border-none bg-[#1a1d24] placeholder:text-[#9da1b9] px-3 rounded-l-none text-sm font-normal leading-normal"
                      placeholder="Tìm kiếm workflow theo tên..."
                    />
                  </div>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0">
                <button className="flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-[#1a1d24] border border-[#282b39] hover:border-primary/50 px-3 transition-all group">
                  <p className="text-[#9da1b9] group-hover:text-white text-xs font-medium">
                    Trạng thái: Tất cả
                  </p>
                  <span className="material-symbols-outlined text-[#9da1b9] text-[18px]">
                    keyboard_arrow_down
                  </span>
                </button>
                <button className="flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-[#1a1d24] border border-[#282b39] hover:border-primary/50 px-3 transition-all group">
                  <p className="text-[#9da1b9] group-hover:text-white text-xs font-medium">
                    Sắp xếp: Mới nhất
                  </p>
                  <span className="material-symbols-outlined text-[#9da1b9] text-[18px]">sort</span>
                </button>
              </div>
            </div>

            {/* Workflows table for this project */}
            <div className="w-full overflow-hidden rounded-xl border border-[#282b39] bg-[#15171e]">
              <div className="hidden md:grid grid-cols-12 gap-4 border-b border-[#282b39] bg-[#1a1d24] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#9da1b9]">
                <div className="col-span-4">Workflow Name</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-3">Last Updated</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              {workflows.length === 0 && (
                <div className="px-6 py-6 text-sm text-[#9da1b9]">
                  Chưa có workflow nào cho project này.
                </div>
              )}

              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-4 border-b border-[#282b39] px-6 py-4 hover:bg-[#1a1d24] transition-colors group items-center"
                >
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                      <span className="material-symbols-outlined text-[20px]">schema</span>
                    </div>
                    <div className="flex flex-col">
                      <p className="text-white text-sm font-bold">{wf.name}</p>
                    </div>
                  </div>
                  <div className="col-span-3 text-sm text-[#9da1b9]">
                    {wf.description ?? "—"}
                  </div>
                  <div className="col-span-3 text-sm text-[#9da1b9]">
                    {wf.updated_at ? new Date(wf.updated_at).toLocaleDateString() : "—"}
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <Link
                      href={`/workflows/${wf.id}/design`}
                      className="flex h-8 items-center justify-center rounded-lg px-3 bg-[#1a1d24] hover:bg-[#282b39] text-[#9da1b9] hover:text-white text-xs font-medium transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px] mr-1">draw</span>
                      Design
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
