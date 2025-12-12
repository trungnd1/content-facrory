import { Sidebar } from "@/components/Sidebar";
import { NewProjectForm } from "./NewProjectForm";

export default function NewProjectPage() {
  return (
    <div className="flex h-screen w-full">
      <Sidebar active="projects" />

      <main className="flex flex-1 flex-col overflow-hidden bg-background-light dark:bg-background-dark relative">
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
            <NewProjectForm />
          </div>
        </div>
      </main>
    </div>
  );
}
