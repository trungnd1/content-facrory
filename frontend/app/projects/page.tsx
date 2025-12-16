import { listProjects } from "@/lib/api";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { ProjectSelectorBar } from "@/components/ProjectSelectorBar";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
    const projects = await listProjects().catch(() => []);

    return (
        <div className="relative flex h-screen w-full overflow-hidden bg-background-light dark:bg-background-dark">
            <Sidebar active="projects" />

            {/* Main content layout aligned with /workflows */}
            <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark">
                <div className="flex h-full grow flex-col">
                    {/* Optional mobile header */}
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

                    <div className="px-6 md:px-12 flex flex-1 justify-center py-8">
                        <div className="flex flex-col max-w-[1200px] flex-1 gap-6">
                            <ProjectSelectorBar />

                            {/* Header + subheader + divider */}
                            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-dark pb-6">
                                <div className="flex flex-col gap-2">
                                    <h1 className="text-white text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">
                                        Projects
                                    </h1>
                                    <p className="text-[#9da1b9] text-base font-normal leading-normal">
                                        Manage, track, and edit your AI content generation projects.
                                    </p>
                                </div>
                                <Link
                                    href="/projects/new"
                                    className="flex items-center justify-center gap-2 overflow-hidden rounded-lg h-10 px-5 bg-primary hover:bg-blue-700 transition-all text-white text-sm font-bold leading-normal tracking-[0.015em] shadow-[0_0_15px_rgba(19,55,236,0.3)]"
                                >
                                    <span className="material-symbols-outlined text-[20px]">add</span>
                                    <span className="truncate">Create Project</span>
                                </Link>
                            </div>

                            {/* Toolbar */}
                            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-surface-dark p-4 rounded-xl border border-border-dark">

                                {/* Search */}
                                <div className="w-full md:w-96">
                                    <label className="flex w-full items-center rounded-lg border border-border-dark bg-[#111218] px-3 h-10 focus-within:border-primary transition-colors">
                                        <span className="material-symbols-outlined text-text-secondary text-[20px]">
                                            search
                                        </span>
                                        <input
                                            className="w-full bg-transparent border-none text-white placeholder:text-text-secondary focus:ring-0 text-sm ml-2"
                                            placeholder="Tìm kiếm workflow theo tên..."
                                        />
                                    </label>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0">
                                    <button className="flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-[#1a1d24] border border-[#282b39] hover:border-primary/50 px-4 transition-all group">
                                        <p className="text-[#9da1b9] group-hover:text-white text-sm font-medium">
                                            Status: All
                                        </p>
                                        <span className="material-symbols-outlined text-[#9da1b9] text-[20px]">
                                            keyboard_arrow_down
                                        </span>
                                    </button>
                                    <button className="flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-[#1a1d24] border border-[#282b39] hover:border-primary/50 px-4 transition-all group">
                                        <p className="text-[#9da1b9] group-hover:text-white text-sm font-medium">
                                            Date: Last 30 Days
                                        </p>
                                        <span className="material-symbols-outlined text-[#9da1b9] text-[20px]">
                                            keyboard_arrow_down
                                        </span>
                                    </button>
                                    <button className="flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-lg bg-[#1a1d24] border border-[#282b39] hover:border-primary/50 px-4 transition-all group">
                                        <span className="material-symbols-outlined text-[#9da1b9] text-[20px]">
                                            sort
                                        </span>
                                        <p className="text-[#9da1b9] group-hover:text-white text-sm font-medium">
                                            Newest First
                                        </p>
                                    </button>
                                </div>
                                <div className="hidden sm:flex h-10 items-center justify-center rounded-lg bg-[#1a1d24] p-1 border border-[#282b39]">
                                    <label className="flex cursor-pointer h-full items-center justify-center rounded-md px-3 bg-[#282b39] text-white shadow-sm transition-all">
                                        <span className="material-symbols-outlined text-[20px] mr-1">list</span>
                                        <span className="text-xs font-bold">List</span>
                                        <input className="hidden" name="view-toggle" type="radio" defaultChecked value="List" />
                                    </label>
                                    <label className="flex cursor-pointer h-full items-center justify-center rounded-md px-3 text-[#9da1b9] hover:text-white transition-all">
                                        <span className="material-symbols-outlined text-[20px] mr-1">grid_view</span>
                                        <span className="text-xs font-medium">Grid</span>
                                        <input className="hidden" name="view-toggle" type="radio" value="Grid" />
                                    </label>
                                </div>
                            </div>

                            {/* Main content: projects table */}
                            <div className="w-full overflow-hidden rounded-xl border border-[#282b39] bg-[#15171e]">
                                <div className="hidden md:grid grid-cols-12 gap-4 border-b border-[#282b39] bg-[#1a1d24] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#9da1b9]">
                                    <div className="col-span-5">Project Name</div>
                                    <div className="col-span-2">Status</div>
                                    <div className="col-span-3">Last Updated</div>
                                    <div className="col-span-2 text-right">Actions</div>
                                </div>

                                {projects.length === 0 && (
                                    <div className="px-6 py-6 text-sm text-[#9da1b9]">
                                        No projects yet. Start by creating your first project.
                                    </div>
                                )}
                                {projects.map((project) => (
                                    <div
                                        key={project.id}
                                        className="grid grid-cols-1 md:grid-cols-12 gap-4 border-b border-[#282b39] px-6 py-4 hover:bg-[#1a1d24] transition-colors group items-center"
                                    >
                                        <div className="col-span-5 flex items-center gap-4">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                                                <span className="material-symbols-outlined">description</span>
                                            </div>
                                            <Link href={`/workflows?projectId=${project.id}`} className="flex flex-col">
                                                <p className="text-white text-sm font-bold hover:underline">
                                                    {project.name}
                                                </p>
                                                {project.description && (
                                                    <p className="text-[#9da1b9] text-xs line-clamp-1">
                                                        {project.description}
                                                    </p>
                                                )}
                                            </Link>
                                        </div>
                                        <div className="col-span-2 flex items-center justify-between md:justify-start">
                                            <span className="md:hidden text-[#9da1b9] text-xs font-medium">
                                                Status:
                                            </span>
                                            <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-500 border border-green-500/20">
                                                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500" />
                                                {project.status ?? "Active"}
                                            </span>
                                        </div>
                                        <div className="col-span-3 flex items-center justify-between md:justify-start">
                                            <span className="md:hidden text-[#9da1b9] text-xs font-medium">
                                                Updated:
                                            </span>
                                            <p className="text-[#9da1b9] text-sm">
                                                {project.updated_at
                                                    ? new Date(project.updated_at).toLocaleDateString()
                                                    : "—"}
                                            </p>
                                        </div>
                                        <div className="col-span-2 flex justify-end gap-2">
                                            <Link
                                                href={`/projects/new?projectId=${project.id}`}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#282b39] text-[#9da1b9] hover:text-white transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                            </Link>
                                            <button
                                                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#282b39] text-[#9da1b9] hover:text-red-400 transition-colors"
                                                type="button"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
