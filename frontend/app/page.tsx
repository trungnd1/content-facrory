import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";

export default function Home() {
  return (
    <div className="h-screen flex overflow-hidden bg-background-light dark:bg-background-dark">
      {/* Sidebar */}
      <Sidebar active="dashboard" />

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full">
        {/* Top bar */}
        <header className="sticky top-0 z-10 w-full border-b border-slate-200 dark:border-slate-800 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Dashboard
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Overview of your studio activity</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-full h-8 w-8 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 text-xs font-medium flex items-center justify-center">
                A
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Quick actions */}
            <section className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Quick Start</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Create a project, attach workflows and agents.
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button className="px-3 py-1.5 rounded-lg bg-primary text-white font-medium">
                    New Project
                  </button>
                  <button className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                    New Workflow
                  </button>
                  <button className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                    New Agent
                  </button>
                </div>
              </div>
              <div className="w-full lg:w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Recent Executions</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">No runs yet. Start a workflow to see activity here.</p>
              </div>
            </section>

            {/* Stats */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark shadow-sm">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Projects</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">0</p>
              </div>
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark shadow-sm">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Workflows</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">0</p>
              </div>
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark shadow-sm">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Agents</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">0</p>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}