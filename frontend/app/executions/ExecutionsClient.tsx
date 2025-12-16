"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useProject } from "@/components/ProjectProvider";
import {
  deleteExecution,
  listExecutions,
  listWorkflows,
  listWorkflowsByProject,
  type Workflow,
  type WorkflowExecution,
} from "@/lib/api";

function getStatusBadge(status: string): { label: string; className: string } {
  switch ((status ?? "").toLowerCase()) {
    case "running":
      return {
        label: "Đang chạy",
        className:
          "inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-400 border border-blue-500/20",
      };
    case "completed":
      return {
        label: "Hoàn thành",
        className:
          "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20",
      };
    case "failed":
      return {
        label: "Lỗi",
        className:
          "inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 border border-red-500/20",
      };
    case "cancelled":
      return {
        label: "Đã dừng",
        className:
          "inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-300 border border-slate-500/20",
      };
    case "waiting_approval":
      return {
        label: "Chờ duyệt",
        className:
          "inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 border border-amber-500/20",
      };
    default:
      return {
        label: status,
        className:
          "inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-300 border border-slate-500/20",
      };
  }
}

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  return new Date(iso).toLocaleString();
}

export function ExecutionsClient() {
  const { currentProject } = useProject();
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[] | null>(null);

  const [statusFilter, setStatusFilter] = useState<
    "all" | "running" | "completed" | "failed" | "waiting_approval" | "stopped"
  >("all");
  const [workflowFilterId, setWorkflowFilterId] = useState<string>("all");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const workflowMenuRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  const projectId = currentProject?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listExecutions({ limit: 50, projectId })
      .then((items) => {
        if (cancelled) return;
        setExecutions(items ?? []);
        setSelectedIds(new Set());
      })
      .catch((e) => {
        if (cancelled) return;
        setExecutions([]);
        setError(e instanceof Error ? e.message : "Failed to load executions");
        setSelectedIds(new Set());
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const items = projectId ? await listWorkflowsByProject(projectId) : await listWorkflows();
        if (cancelled) return;
        setWorkflows(items ?? []);
      } catch {
        if (cancelled) return;
        setWorkflows([]);
      }
    };

    load();

    // reset workflow filter when switching project
    setWorkflowFilterId("all");

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (statusMenuOpen && statusMenuRef.current && target && !statusMenuRef.current.contains(target)) {
        setStatusMenuOpen(false);
      }
      if (workflowMenuOpen && workflowMenuRef.current && target && !workflowMenuRef.current.contains(target)) {
        setWorkflowMenuOpen(false);
      }
      if (sortMenuOpen && sortMenuRef.current && target && !sortMenuRef.current.contains(target)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [statusMenuOpen, workflowMenuOpen, sortMenuOpen]);

  const workflowById = useMemo(() => {
    const map = new Map<string, Workflow>();
    for (const w of workflows) map.set(w.id, w);
    return map;
  }, [workflows]);

  const filteredExecutions = useMemo(() => {
    const q = search.trim().toLowerCase();

    const matchesStatus = (e: WorkflowExecution) => {
      const s = (e.status ?? "").toLowerCase();
      if (statusFilter === "all") return true;
      if (statusFilter === "stopped") return !s || s === "cancelled";
      return s === statusFilter;
    };

    const matchesWorkflow = (e: WorkflowExecution) => {
      if (workflowFilterId === "all") return true;
      return (e.workflow_id ?? "") === workflowFilterId;
    };

    const matchesSearch = (e: WorkflowExecution) => {
      if (!q) return true;
      const idMatch = (e.id ?? "").toLowerCase().includes(q);
      const wfId = (e.workflow_id ?? "").toLowerCase();
      const wfName = e.workflow_id ? (workflowById.get(e.workflow_id)?.name ?? "") : "";
      const wfMatch = wfId.includes(q) || wfName.toLowerCase().includes(q);
      return idMatch || wfMatch;
    };

    const sorted = [...(executions ?? [])]
      .filter(matchesStatus)
      .filter(matchesWorkflow)
      .filter(matchesSearch)
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return sortDirection === "desc" ? tb - ta : ta - tb;
      });

    return sorted;
  }, [executions, search, sortDirection, statusFilter, workflowFilterId, workflowById]);

  const visibleIds = useMemo(() => filteredExecutions.map((e) => e.id), [filteredExecutions]);

  const allVisibleSelected = useMemo(() => {
    if (visibleIds.length === 0) return false;
    for (const id of visibleIds) {
      if (!selectedIds.has(id)) return false;
    }
    return true;
  }, [selectedIds, visibleIds]);

  const selectedCount = selectedIds.size;

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openDeleteConfirm = () => {
    if (deleteBusy) return;
    if (selectedIds.size === 0) return;
    setDeleteConfirmIds(Array.from(selectedIds));
  };

  const handleConfirmDeleteSelected = async () => {
    if (deleteBusy) return;
    if (!deleteConfirmIds || deleteConfirmIds.length === 0) return;

    setDeleteBusy(true);
    try {
      const ids = deleteConfirmIds;
      await Promise.all(ids.map((id) => deleteExecution(id)));
      const idSet = new Set(ids);
      setExecutions((prev) => prev.filter((e) => !idSet.has(e.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setDeleteConfirmIds(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete executions");
    } finally {
      setDeleteBusy(false);
    }
  };

  const emptyText = useMemo(() => {
    if (loading) return "Đang tải executions...";
    if (error) return `Lỗi tải executions: ${error}`;
    if (projectId) return "Chưa có execution nào cho project đang chọn.";
    return "Chưa có execution nào.";
  }, [loading, error, projectId]);

  const statusLabel =
    statusFilter === "all"
      ? "Tất cả"
      : statusFilter === "running"
      ? "Đang chạy"
      : statusFilter === "completed"
      ? "Hoàn thành"
      : statusFilter === "failed"
      ? "Lỗi"
      : statusFilter === "waiting_approval"
      ? "Chờ duyệt"
      : "Đã dừng";

  const selectedWorkflow = workflowFilterId !== "all" ? workflowById.get(workflowFilterId) : null;
  const workflowLabel = selectedWorkflow
    ? `${selectedWorkflow.name}`
    : workflowFilterId === "all"
    ? "Tất cả"
    : "(Không xác định)";

  return (
    <>
      {deleteConfirmIds && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (deleteBusy) return;
              setDeleteConfirmIds(null);
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl border border-border-dark bg-surface-dark shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border-dark flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-300">warning</span>
                  <h3 className="text-sm font-semibold text-white">Xác nhận xóa execution</h3>
                </div>
                <button
                  type="button"
                  className="text-text-secondary hover:text-white transition-colors"
                  onClick={() => {
                    if (deleteBusy) return;
                    setDeleteConfirmIds(null);
                  }}
                  title="Đóng"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="px-5 py-4">
                <p className="text-sm text-text-secondary">
                  Bạn có chắc chắn muốn xóa <span className="text-white font-semibold">{deleteConfirmIds.length}</span> execution?
                </p>
                <p className="mt-2 text-xs text-text-secondary">
                  Đây là hành động không thể hoàn tác. Tất cả dữ liệu liên quan đến execution (steps, output) sẽ bị xóa.
                </p>
              </div>

              <div className="px-5 py-4 border-t border-border-dark flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="h-9 rounded-lg px-4 text-sm font-semibold bg-[#282b39] text-white hover:bg-[#3b3f54] transition-colors"
                  onClick={() => {
                    if (deleteBusy) return;
                    setDeleteConfirmIds(null);
                  }}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="h-9 rounded-lg px-4 text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={handleConfirmDeleteSelected}
                  disabled={deleteBusy}
                >
                  {deleteBusy ? "Đang xóa..." : "Xóa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar: Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-surface-dark p-4 rounded-xl border border-border-dark">
        <div className="w-full md:w-96">
          <label className="flex w-full items-center rounded-lg border border-border-dark bg-[#111218] px-3 h-10 focus-within:border-primary transition-colors">
            <span className="material-symbols-outlined text-text-secondary text-[20px]">search</span>
            <input
              className="w-full bg-transparent border-none text-white placeholder:text-text-secondary focus:ring-0 text-sm ml-2"
              placeholder="Tìm kiếm theo Execution ID / Workflow..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 text-text-secondary text-sm mr-2">
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            <span>Lọc:</span>
          </div>

          <div className="relative" ref={workflowMenuRef}>
            <button
              type="button"
              onClick={() => {
                setWorkflowMenuOpen((v) => !v);
                setStatusMenuOpen(false);
                setSortMenuOpen(false);
              }}
              className="group flex h-8 items-center justify-center gap-x-2 rounded-lg bg-[#282b39] hover:bg-[#3b3f54] border border-transparent hover:border-border-dark pl-3 pr-2 transition-all"
            >
              <p className="text-white text-xs font-medium truncate max-w-[220px]">Workflow: {workflowLabel}</p>
              <span className="material-symbols-outlined text-text-secondary text-[16px]">keyboard_arrow_down</span>
            </button>
            {workflowMenuOpen && (
              <div className="absolute left-0 mt-2 w-[360px] max-w-[85vw] rounded-lg border border-border-dark bg-[#111218] shadow-lg z-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setWorkflowFilterId("all");
                    setWorkflowMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    workflowFilterId === "all"
                      ? "bg-[#232530] text-white"
                      : "text-text-secondary hover:bg-[#232530] hover:text-white"
                  }`}
                >
                  Tất cả workflows
                </button>
                {workflows.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setWorkflowFilterId(w.id);
                      setWorkflowMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 transition-colors ${
                      workflowFilterId === w.id
                        ? "bg-[#232530] text-white"
                        : "text-text-secondary hover:bg-[#232530] hover:text-white"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-medium truncate">{w.name}</span>
                      <span className="text-[11px] opacity-70 truncate">{w.id}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={statusMenuRef}>
            <button
              type="button"
              onClick={() => {
                setStatusMenuOpen((v) => !v);
                setWorkflowMenuOpen(false);
                setSortMenuOpen(false);
              }}
              className="group flex h-8 items-center justify-center gap-x-2 rounded-lg bg-[#282b39] hover:bg-[#3b3f54] border border-transparent hover:border-border-dark pl-3 pr-2 transition-all"
            >
              <p className="text-white text-xs font-medium">Trạng thái: {statusLabel}</p>
              <span className="material-symbols-outlined text-text-secondary text-[16px]">keyboard_arrow_down</span>
            </button>
            {statusMenuOpen && (
              <div className="absolute left-0 mt-2 w-56 rounded-lg border border-border-dark bg-[#111218] shadow-lg z-50 overflow-hidden">
                {(
                  [
                    { value: "all" as const, label: "Tất cả" },
                    { value: "running" as const, label: "Đang chạy" },
                    { value: "completed" as const, label: "Hoàn thành" },
                    { value: "failed" as const, label: "Lỗi" },
                    { value: "waiting_approval" as const, label: "Chờ duyệt" },
                    { value: "stopped" as const, label: "Đã dừng" },
                  ]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setStatusMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                      statusFilter === opt.value
                        ? "bg-[#232530] text-white"
                        : "text-text-secondary hover:bg-[#232530] hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={sortMenuRef}>
            <button
              type="button"
              onClick={() => {
                setSortMenuOpen((v) => !v);
                setWorkflowMenuOpen(false);
                setStatusMenuOpen(false);
              }}
              className="group flex h-8 items-center justify-center gap-x-2 rounded-lg bg-[#282b39] hover:bg-[#3b3f54] border border-transparent hover:border-border-dark pl-3 pr-2 transition-all"
            >
              <p className="text-white text-xs font-medium">Created: {sortDirection === "desc" ? "Mới nhất" : "Cũ nhất"}</p>
              <span className="material-symbols-outlined text-text-secondary text-[16px]">sort</span>
            </button>
            {sortMenuOpen && (
              <div className="absolute left-0 mt-2 w-56 rounded-lg border border-border-dark bg-[#111218] shadow-lg z-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setSortDirection("desc");
                    setSortMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    sortDirection === "desc"
                      ? "bg-[#232530] text-white"
                      : "text-text-secondary hover:bg-[#232530] hover:text-white"
                  }`}
                >
                  Mới nhất
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortDirection("asc");
                    setSortMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    sortDirection === "asc"
                      ? "bg-[#232530] text-white"
                      : "text-text-secondary hover:bg-[#232530] hover:text-white"
                  }`}
                >
                  Cũ nhất
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selection row (below toolbar) */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border-dark bg-surface-dark px-4 py-3 text-xs text-text-secondary">
        <div className="flex items-center gap-3 min-w-0">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border-dark bg-[#111218] text-primary focus:ring-primary"
              checked={allVisibleSelected}
              onChange={(e) => {
                if (e.target.checked) selectAllVisible();
                else clearSelection();
              }}
            />
            <span className="text-xs font-medium text-white">Select All</span>
            <span className="text-text-secondary">|</span>
            <button
              type="button"
              className="text-xs font-medium text-text-secondary hover:text-white"
              onClick={clearSelection}
              disabled={deleteBusy}
            >
              None
            </button>
          </label>
          <span className="text-text-secondary">({selectedCount} selected)</span>
        </div>

        <button
          type="button"
          className="h-9 rounded-lg px-4 text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={openDeleteConfirm}
          disabled={selectedCount === 0 || deleteBusy}
        >
          Delete
        </button>
      </div>

    <div className="w-full overflow-hidden rounded-xl border border-[#282b39] bg-[#15171e]">
      <div className="hidden md:grid grid-cols-12 gap-4 border-b border-[#282b39] bg-[#1a1d24] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#9da1b9]">
        <div className="col-span-1">&nbsp;</div>
        <div className="col-span-3">Execution</div>
        <div className="col-span-3">Workflow</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">Created</div>
        <div className="col-span-1 text-right">View</div>
      </div>

      {filteredExecutions.length === 0 && (
        <div className="px-6 py-6 text-sm text-[#9da1b9]">{emptyText}</div>
      )}

      {filteredExecutions.map((execution) => {
        const badge = getStatusBadge(execution.status);
        const wf = execution.workflow_id ? workflowById.get(execution.workflow_id) : null;
        const checked = selectedIds.has(execution.id);
        return (
          <div
            key={execution.id}
            className="grid grid-cols-1 md:grid-cols-12 gap-4 border-b border-[#282b39] px-6 py-4 hover:bg-[#1a1d24] transition-colors group items-center"
          >
            <div className="hidden md:flex col-span-1 items-center">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border-dark bg-[#111218] text-primary focus:ring-primary"
                checked={checked}
                onChange={(e) => toggleRow(execution.id, e.target.checked)}
                aria-label="Select execution"
              />
            </div>

            <div className="col-span-3 flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <span className="material-symbols-outlined">play_circle</span>
              </div>
              <Link href={`/executions/${execution.id}`} className="flex flex-col min-w-0">
                <p className="text-white text-sm font-bold hover:underline truncate">{execution.id}</p>
                <p className="text-[#9da1b9] text-xs truncate">
                  Project: {execution.project_id ?? "—"}
                </p>
              </Link>
            </div>

            <div className="col-span-3 flex items-center justify-between md:justify-start">
              <span className="md:hidden text-[#9da1b9] text-xs font-medium">Workflow:</span>
              <div className="flex flex-col min-w-0">
                <p className="text-white text-sm font-semibold truncate">{wf?.name ?? "(Workflow)"}</p>
                <p className="text-[#9da1b9] text-xs truncate">{execution.workflow_id ?? "—"}</p>
              </div>
            </div>

            <div className="col-span-2 flex items-center justify-between md:justify-start">
              <span className="md:hidden text-[#9da1b9] text-xs font-medium">Status:</span>
              <span className={badge.className}>{badge.label}</span>
            </div>

            <div className="col-span-2 flex items-center justify-between md:justify-start">
              <span className="md:hidden text-[#9da1b9] text-xs font-medium">Created:</span>
              <p className="text-[#9da1b9] text-sm">{formatDateTime(execution.created_at)}</p>
            </div>

            <div className="col-span-1 flex justify-end">
              <Link
                href={`/executions/${execution.id}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#282b39] text-[#9da1b9] hover:text-white transition-colors"
                aria-label="View execution"
              >
                <span className="material-symbols-outlined text-[20px]">open_in_new</span>
              </Link>
            </div>

            <div className="md:hidden col-span-1 flex justify-end">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border-dark bg-[#111218] text-primary focus:ring-primary"
                checked={checked}
                onChange={(e) => toggleRow(execution.id, e.target.checked)}
                aria-label="Select execution"
              />
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}
