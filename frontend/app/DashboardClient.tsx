"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useProject } from "@/components/ProjectProvider";
import {
  getAgent,
  listAgents,
  listExecutions,
  listProjects,
  listWorkflowSteps,
  listWorkflowsWithLatestExecution,
  type Agent,
  type Project,
  type Workflow,
  type WorkflowExecution,
  type WorkflowWithLatestExecution,
} from "@/lib/api";

type StatusBadge = { label: string; className: string };

const dashboard_max_list = 3;

function formatRelativeOrDate(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Vừa xong";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  return new Date(iso).toLocaleDateString();
}

function getExecutionStatusBadge(status?: string | null): StatusBadge {
  const s = (status ?? "").toLowerCase();
  if (s === "running") {
    return {
      label: "Running",
      className:
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20",
    };
  }
  if (s === "completed") {
    return {
      label: "Completed",
      className:
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20",
    };
  }
  if (s === "failed") {
    return {
      label: "Failed",
      className:
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20",
    };
  }
  if (s === "waiting_approval") {
    return {
      label: "Waiting approval",
      className:
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20",
    };
  }
  if (s === "cancelled") {
    return {
      label: "Cancelled",
      className:
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20",
    };
  }
  return {
    label: status ?? "—",
    className:
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20",
  };
}

function getProjectStatusBadge(status?: string | null): StatusBadge {
  const s = (status ?? "active").toLowerCase();
  if (s === "active") {
    return {
      label: "Active",
      className:
        "text-xs font-medium px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
    };
  }
  if (s === "planning") {
    return {
      label: "Planning",
      className:
        "text-xs font-medium px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
    };
  }
  return {
    label: status ?? "—",
    className:
      "text-xs font-medium px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  };
}

function sortByUpdated(a?: { updated_at?: string; created_at?: string }, b?: { updated_at?: string; created_at?: string }) {
  const ta = a?.updated_at ? new Date(a.updated_at).getTime() : a?.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b?.updated_at ? new Date(b.updated_at).getTime() : b?.created_at ? new Date(b.created_at).getTime() : 0;
  return tb - ta;
}

function countNewLast7Days(items: Array<{ created_at?: string }>): number {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return items.filter((it) => {
    const t = it.created_at ? new Date(it.created_at).getTime() : NaN;
    return Number.isFinite(t) && now - t <= weekMs;
  }).length;
}

export function DashboardClient() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id ?? null;

  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [workflowsWithLatest, setWorkflowsWithLatest] = useState<WorkflowWithLatestExecution[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // For dashboard "Recent Workflows" model column (best-effort)
  const [workflowModelById, setWorkflowModelById] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      listProjects().catch(() => []),
      listAgents().catch(() => []),
      listWorkflowsWithLatestExecution().catch(() => []),
      listExecutions({ limit: dashboard_max_list, projectId }).catch(() => []),
    ])
      .then(([p, a, w, e]) => {
        if (cancelled) return;
        setProjects(p ?? []);
        setAgents(a ?? []);
        setWorkflowsWithLatest(w ?? []);
        setExecutions(e ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const scopedWorkflows = useMemo(() => {
    const items = workflowsWithLatest ?? [];
    if (!projectId) return items;
    return items.filter((it) => it.workflow?.project_id === projectId);
  }, [workflowsWithLatest, projectId]);

  const recentProjects = useMemo(() => {
    return [...(projects ?? [])].sort(sortByUpdated).slice(0, dashboard_max_list);
  }, [projects]);

  const activeAgents = useMemo(() => {
    const sorted = [...(agents ?? [])].sort((a, b) => Number(Boolean(b.is_active)) - Number(Boolean(a.is_active)));
    return sorted.slice(0, dashboard_max_list);
  }, [agents]);

  const recentWorkflows = useMemo(() => {
    const sorted = [...(scopedWorkflows ?? [])].sort((a, b) => {
      const ta = a.latest_execution?.created_at
        ? new Date(a.latest_execution.created_at).getTime()
        : a.workflow?.updated_at
        ? new Date(a.workflow.updated_at).getTime()
        : a.workflow?.created_at
        ? new Date(a.workflow.created_at).getTime()
        : 0;
      const tb = b.latest_execution?.created_at
        ? new Date(b.latest_execution.created_at).getTime()
        : b.workflow?.updated_at
        ? new Date(b.workflow.updated_at).getTime()
        : b.workflow?.created_at
        ? new Date(b.workflow.created_at).getTime()
        : 0;
      return tb - ta;
    });
    return sorted.slice(0, dashboard_max_list);
  }, [scopedWorkflows]);

  const recentExecutions = useMemo(() => {
    const sorted = [...(executions ?? [])].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return sorted.slice(0, dashboard_max_list);
  }, [executions]);

  const workflowNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of workflowsWithLatest ?? []) {
      if (it.workflow?.id && it.workflow?.name) map.set(it.workflow.id, it.workflow.name);
    }
    return map;
  }, [workflowsWithLatest]);

  useEffect(() => {
    let cancelled = false;

    const ensureModels = async (items: WorkflowWithLatestExecution[]) => {
      const needed = items
        .map((it) => it.workflow)
        .filter((w): w is Workflow => Boolean(w && w.id))
        .filter((w) => !workflowModelById[w.id]);

      if (needed.length === 0) return;

      const updates: Record<string, string> = {};

      for (const wf of needed.slice(0, dashboard_max_list)) {
        try {
          const steps = await listWorkflowSteps(wf.id);
          const firstAgentStep = (steps ?? []).find((s) => s.type === "AGENT" && s.agent_id);
          if (!firstAgentStep?.agent_id) {
            updates[wf.id] = "—";
            continue;
          }
          const agent = await getAgent(firstAgentStep.agent_id);
          updates[wf.id] = agent?.model ?? "—";
        } catch {
          updates[wf.id] = "—";
        }
      }

      if (cancelled) return;
      setWorkflowModelById((prev) => ({ ...prev, ...updates }));
    };

    ensureModels(recentWorkflows);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentWorkflows]);

  const projectsNew = useMemo(() => countNewLast7Days(projects), [projects]);
  const workflowsNew = useMemo(() => {
    const workflows = (scopedWorkflows ?? []).map((it) => it.workflow).filter(Boolean) as Workflow[];
    return countNewLast7Days(workflows);
  }, [scopedWorkflows]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark p-5 text-sm text-slate-500 dark:text-slate-400">
        Loading dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Dashboard Tổng quan
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Chào mừng trở lại{currentProject?.name ? ` — ${currentProject.name}` : ""}, đây là tình hình hoạt động studio của bạn.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 hover:border-primary dark:hover:border-primary text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg shadow-sm transition-all hover:text-primary"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            <span>Create Project</span>
          </Link>
          <Link
            href="/workflows"
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 hover:border-primary dark:hover:border-primary text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg shadow-sm transition-all hover:text-primary"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            <span>Create Workflow</span>
          </Link>
          <Link
            href="/agents/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg shadow-lg shadow-primary/25 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">smart_toy</span>
            <span>Create Agent</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
              <span className="material-symbols-outlined text-[24px]">folder</span>
            </div>
            <span className="flex items-center text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
              +{projectsNew} new
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Tổng số Projects</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{projects.length}</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
              <span className="material-symbols-outlined text-[24px]">account_tree</span>
            </div>
            <span className="flex items-center text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
              +{workflowsNew} new
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Tổng số Workflows</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{scopedWorkflows.length}</p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
              <span className="material-symbols-outlined text-[24px]">smart_toy</span>
            </div>
            <span className="flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
              Stable
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Tổng số Agents</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{agents.length}</p>
        </div>
      </div>

      <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white">Recent Executions</h3>
          <Link className="text-sm text-primary hover:text-primary/80 font-medium" href="/executions">
            View all
          </Link>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {recentExecutions.map((e) => {
            const badge = getExecutionStatusBadge(e.status);
            const wfName = e.workflow_id ? workflowNameById.get(e.workflow_id) : null;
            return (
              <Link
                key={e.id}
                href={`/executions/${e.id}`}
                className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="size-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">play_circle</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{wfName ?? "Workflow"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{e.id}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={badge.className}>{badge.label}</span>
                  <span className="text-xs text-slate-500">{formatRelativeOrDate(e.created_at)}</span>
                </div>
              </Link>
            );
          })}
          {recentExecutions.length === 0 && (
            <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
              No runs yet. Start a workflow to see activity here.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col h-full">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">Recent Projects</h3>
            <Link className="text-sm text-primary hover:text-primary/80 font-medium" href="/projects">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {recentProjects.map((p) => {
              const badge = getProjectStatusBadge(p.status);
              return (
                <Link
                  key={p.id}
                  href={`/workflows?projectId=${p.id}`}
                  className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="size-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <span className="material-symbols-outlined text-[20px]">folder</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Updated: {formatRelativeOrDate(p.updated_at ?? p.created_at)}</p>
                  </div>
                  <span className={badge.className}>{badge.label}</span>
                </Link>
              );
            })}
            {recentProjects.length === 0 && (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400">No projects yet.</div>
            )}
          </div>
        </div>

        <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col h-full">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">Active Agents</h3>
            <Link className="text-sm text-primary hover:text-primary/80 font-medium" href="/agents">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {activeAgents.map((a) => {
              const isActive = Boolean(a.is_active);
              return (
                <Link
                  key={a.id}
                  href={`/agents/${a.id}`}
                  className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="size-10 rounded-full bg-gradient-to-tr from-violet-500 to-purple-500 p-0.5">
                    <div className="w-full h-full rounded-full bg-surface-light dark:bg-surface-dark flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px] text-violet-500">smart_toy</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{a.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{a.type ?? "Agent"}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isActive ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                    <span className="text-xs text-slate-500">{isActive ? "Active" : "Disabled"}</span>
                  </div>
                </Link>
              );
            })}
            {activeAgents.length === 0 && (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400">No agents yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white">Recent Workflows</h3>
          <Link className="text-sm text-primary hover:text-primary/80 font-medium" href="/workflows">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-3" scope="col">Workflow</th>
                <th className="px-6 py-3" scope="col">Model</th>
                <th className="px-6 py-3" scope="col">Status</th>
                <th className="px-6 py-3 text-right" scope="col">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {recentWorkflows.map((it) => {
                const wf = it.workflow;
                if (!wf) return null;
                const badge = getExecutionStatusBadge(it.latest_execution?.status ?? "—");
                const model = workflowModelById[wf.id] ?? "—";
                return (
                  <tr key={wf.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-3">
                      <Link href={`/workflows/${wf.id}/design`} className="flex items-center gap-3">
                        <div className="size-8 rounded bg-blue-500/10 text-blue-500 flex items-center justify-center">
                          <span className="material-symbols-outlined text-[18px]">account_tree</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-slate-900 dark:text-white font-medium truncate">{wf.name}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{wf.id}</span>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-3">{model}</td>
                    <td className="px-6 py-3">
                      <span className={badge.className}>{badge.label}</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link className="text-slate-400 hover:text-slate-600 dark:hover:text-white" href={`/workflows/${wf.id}/design`}>
                        <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {recentWorkflows.length === 0 && (
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400" colSpan={4}>
                    No workflows yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
