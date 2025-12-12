import { Sidebar } from "@/components/Sidebar";
import { ProjectSelectorBar } from "@/components/ProjectSelectorBar";

export default function ExecutionsIndexPage() {
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background-light dark:bg-background-dark">
      <Sidebar active="executions" />

      <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark">
        <div className="flex h-full grow flex-col">
          <div className="px-6 md:px-12 flex flex-1 justify-center py-8">
            <div className="flex flex-col max-w-[1200px] flex-1 gap-6">
              <ProjectSelectorBar />

              <div className="flex flex-col gap-4 max-w-3xl">
                <h1 className="text-3xl font-black tracking-tight text-white">Executions</h1>
                <p className="text-sm text-slate-400">
                  Danh sách executions chi tiết sẽ được thêm sau khi backend hỗ trợ API list.
                  Hiện tại hãy mở execution từ màn hình workflow hoặc bằng URL cụ thể.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
