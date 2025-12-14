import { Sidebar } from "@/components/Sidebar";
import { ProjectSelectorBar } from "@/components/ProjectSelectorBar";
import { CreateWorkflowButton } from "./CreateWorkflowButton";
import { WorkflowsClient } from "./WorkflowsClient";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
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

                            <WorkflowsClient />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
