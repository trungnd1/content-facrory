import { Sidebar } from "@/components/Sidebar";
import { ProjectSelectorBar } from "@/components/ProjectSelectorBar";
import { CreateWorkflowButton } from "./CreateWorkflowButton";
import Link from "next/link";
import { listProjects, listWorkflows } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
    const [projects, workflows] = await Promise.all([
        listProjects().catch(() => []),
        listWorkflows().catch(() => []),
    ]);

    const projectMap = new Map(projects.map((p) => [p.id, p.name as string]));

    return (
        <div className="relative flex h-screen w-full overflow-hidden bg-background-light dark:bg-background-dark">
            {/* Sidebar from workflows template */}
            <Sidebar active="workflows" />

            {/* Main content */}
            <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark">
                <div className="flex h-full grow flex-col">
                    <div className="px-6 md:px-12 flex flex-1 justify-center py-8">
                        <div className="flex flex-col max-w-[1200px] flex-1 gap-6">
                            <ProjectSelectorBar />

                            {/* Page Heading */}
                            <div className="flex flex-wrap justify-between items-end gap-4 border-b border-border-dark pb-6">
                                <div className="flex min-w-72 flex-col gap-2">
                                    <h2 className="text-white text-3xl font-black leading-tight tracking-[-0.033em]">
                                        Danh sách Workflows
                                    </h2>
                                    <p className="text-text-secondary text-base font-normal leading-normal">
                                        Quản lý, theo dõi và tối ưu hóa các quy trình tạo nội dung AI tự động.
                                    </p>
                                </div>
                                <CreateWorkflowButton />
                            </div>

                            {/* Toolbar: Search & Filters */}
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
                                {/* Chips / Actions */}
                                <div className="flex flex-wrap gap-2 items-center">
                                    <div className="flex items-center gap-2 text-text-secondary text-sm mr-2">
                                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                                        <span>Lọc:</span>
                                    </div>
                                    <button className="group flex h-8 items-center justify-center gap-x-2 rounded-lg bg-[#282b39] hover:bg-[#3b3f54] border border-transparent hover:border-border-dark pl-3 pr-2 transition-all">
                                        <p className="text-white text-xs font-medium">Trạng thái: Tất cả</p>
                                        <span className="material-symbols-outlined text-text-secondary text-[16px]">
                                            keyboard_arrow_down
                                        </span>
                                    </button>
                                    <button className="group flex h-8 items-center justify-center gap-x-2 rounded-lg bg-[#282b39] hover:bg-[#3b3f54] border border-transparent hover;border-border-dark pl-3 pr-2 transition-all">
                                        <p className="text-white text-xs font-medium">Dự án: Tất cả</p>
                                        <span className="material-symbols-outlined text-text-secondary text-[16px]">
                                            keyboard_arrow_down
                                        </span>
                                    </button>
                                    <button className="group flex h-8 items-center justify-center gap-x-2 rounded-lg bg-[#282b39] hover:bg-[#3b3f54] border border-transparent hover:border-border-dark pl-3 pr-2 transition-all">
                                        <p className="text-white text-xs font-medium">Sắp xếp: Mới nhất</p>
                                        <span className="material-symbols-outlined text-text-secondary text-[16px]">sort</span>
                                    </button>
                                    <div className="w-px h-6 bg-border-dark mx-1" />
                                    <button className="flex size-8 items-center justify-center rounded-lg bg-[#282b39] hover:bg-primary text-text-secondary hover:text-white transition-colors">
                                        <span className="material-symbols-outlined text-[20px]">grid_view</span>
                                    </button>
                                    <button className="flex size-8 items-center justify-center rounded-lg bg-primary text-white shadow-md">
                                        <span className="material-symbols-outlined text-[20px]">list</span>
                                    </button>
                                </div>
                            </div>

                            {/* Data Table (skeleton: no real workflows yet) */}
                            <div className="flex flex-col overflow-hidden rounded-xl border border-border-dark bg-surface-dark shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-[#111218] border-b border-border-dark">
                                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[25%]">
                                                    Tên Workflow
                                                </th>
                                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[30%]">
                                                    Mô tả ngắn
                                                </th>
                                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[20%]">
                                                    Project
                                                </th>
                                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[15%]">
                                                    Lần chạy cuối
                                                </th>
                                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[15%] text-right">
                                                    Hành động
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-dark">
                                            {workflows.length === 0 && (
                                                <tr>
                                                    <td
                                                        className="p-4 text-sm text-text-secondary"
                                                        colSpan={5}
                                                    >
                                                        Chưa có workflow nào. Bạn có thể bắt đầu bằng cách tạo workflow mới.
                                                    </td>
                                                </tr>
                                            )}
                                            {workflows.map((wf) => {
                                                const projectName = wf.project_id
                                                    ? projectMap.get(wf.project_id) ?? "(Unknown project)"
                                                    : "(Không có project)";
                                                return (
                                                    <tr
                                                        key={wf.id}
                                                        className="border-t border-border-dark hover:bg-[#15171e] transition-colors"
                                                    >
                                                        <td className="p-4 align-top">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                                                                    <span className="material-symbols-outlined text-[20px]">schema</span>
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <Link
                                                                        href={`/workflows/${wf.id}/design`}
                                                                        className="text-white text-sm font-semibold hover:text-primary transition-colors"
                                                                    >
                                                                        {wf.name}
                                                                    </Link>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 align-top text-sm text-text-secondary">
                                                            {wf.description ?? "—"}
                                                        </td>
                                                        <td className="p-4 align-top text-sm text-text-secondary">
                                                            {projectName}
                                                        </td>
                                                        <td className="p-4 align-top text-sm text-text-secondary">
                                                            {wf.updated_at
                                                                ? new Date(wf.updated_at).toLocaleDateString()
                                                                : "—"}
                                                        </td>
                                                        <td className="p-4 align-top text-right">
                                                            <Link
                                                                href={`/workflows/${wf.id}/design`}
                                                                className="inline-flex h-8 items-center justify-center rounded-lg px-3 bg-[#282b39] hover:bg-[#3b3f54] text-xs text-white font-medium transition-colors"
                                                            >
                                                                <span className="material-symbols-outlined text-[18px] mr-1">draw</span>
                                                                Design
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
