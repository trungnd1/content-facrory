import Link from "next/link";

type SidebarActive =
    | "dashboard"
    | "projects"
    | "workflows"
    | "agents"
    | "executions"
    | "settings";

interface SidebarProps {
    // Which menu item should appear active; defaults to dashboard
    active?: SidebarActive;
}

export function Sidebar({ active = "dashboard" }: SidebarProps) {
    const baseLink =
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium";
    const activeLink =
        "flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary font-medium";

    return (
        <aside className="w-64 bg-surface-light dark:bg-surface-dark border-r border-slate-200 dark:border-slate-800 flex flex-col z-20 hidden md:flex">
            <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-center size-8 rounded-lg bg-primary text-white">
                    <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                </div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                    Creator AI
                </h1>
            </div>
            <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                <Link href="/" className={active === "dashboard" ? activeLink : baseLink}>
                    <span className="material-symbols-outlined group-hover:text-white transition-colors">dashboard</span>
                    <span className="text-sm font-medium">Dashboard</span>
                </Link>
                <Link href="/projects" className={active === "projects" ? activeLink : baseLink}>
                    <span className="material-symbols-outlined text-primary fill-1">folder</span>
                    <span className="text-sm font-bold">Projects</span>
                </Link>
                <Link href="/workflows" className={active === "workflows" ? activeLink : baseLink}>
                    <span className="material-symbols-outlined group-hover:text-white transition-colors">account_tree</span>
                    <span className="text-sm font-medium">Workflows</span>
                </Link>
                <Link href="/agents" className={active === "agents" ? activeLink : baseLink}>
                    <span className="material-symbols-outlined group-hover:text-white transition-colors">smart_toy</span>
                    <span className="text-sm font-medium">Agents</span>
                </Link>
                <Link href="/executions" className={active === "executions" ? activeLink : baseLink}>
                    <span className="material-symbols-outlined group-hover:text-white transition-colors">terminal</span>
                    <span className="text-sm font-medium">Executions</span>
                </Link>
                <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
                    <Link href="#" className={active === "settings" ? activeLink : baseLink}>
                        <span className="material-symbols-outlined group-hover:text-white transition-colors">settings</span>
                        <span className="text-sm font-medium">Settings</span>
                    </Link>
                </div>
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="size-9 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden relative">
                        <div
                            className="bg-center bg-no-repeat bg-cover w-full h-full"
                            style={{
                                backgroundImage:
                                    "url(https://lh3.googleusercontent.com/aida-public/AB6AXuDnWAP7P3jgZMjTCRFT5J19c7wNeZJZbaQ_TZCK22kyNyxHHkscxGEAsnknDSu7RgRx7RoOCr89EPpI782j7NxRAqLiEoHNWH7zAhkk_CRY9107WLtgkFi4JtAn9cN7Z7nzpFbbAjJaNoPgbJOI_jMmyn2Kceh32U7MvkYkVoyCKb9YKST-PGIrX1Ynn2F0-f87jS9dBBVisDggbEsmDGdvxZ-n2xA2wmTUQb0jBWvIqKNkdOZQ7mE2zhCijTaBF7F_SqR5qcQOvMdZ)",
                            }}
                        />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-semibold truncate">Alex Creator</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            Pro Plan
                        </span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
