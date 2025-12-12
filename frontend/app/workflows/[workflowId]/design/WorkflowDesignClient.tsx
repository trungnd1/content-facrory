"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Agent,
  Workflow,
  WorkflowExecution,
  WorkflowExecutionStep,
  WorkflowStep,
  createWorkflowStep,
  cancelExecution,
  listAgents,
  listExecutionSteps,
  listWorkflowSteps,
  runWorkflow,
  updateWorkflow,
  updateWorkflowStep,
} from "@/lib/api";

function getAgentOutputKeys(agent: Agent | undefined): string[] {
  if (!agent) return [];
  const name = (agent.name || "").toLowerCase();
  // Normalize special hyphens/dashes so that variants like
  // "LONG‑FORM" (with non-breaking hyphen) are treated the
  // same as "long-form".
  const normalizedName = name
    .normalize("NFKD")
    .replace(/[\u2010-\u2015\-]+/g, " ");

  if (
    agent.output_schema &&
    typeof agent.output_schema === "object" &&
    !Array.isArray(agent.output_schema)
  ) {
    const schemaKeys = Object.keys(agent.output_schema as Record<string, unknown>);

    // Backward compatibility: some older agents used a generic
    // "contents" field in their output_schema, but the latest
    // Long‑Form generator now standardizes on { topic_id, long_form }.
    if (
      schemaKeys.length === 1 &&
      schemaKeys[0] === "contents" &&
      (
        normalizedName.includes("long form") ||
        (normalizedName.includes("long") &&
          normalizedName.includes("form") &&
          normalizedName.includes("generator"))
      )
    ) {
      return ["topic_id", "long_form"];
    }

    return schemaKeys;
  }

  // Heuristic fallbacks for older agents without output_schema

  // Long-form generator: prefer topic_id + long_form
  if (
    normalizedName.includes("long form") ||
    (normalizedName.includes("long") &&
      normalizedName.includes("form") &&
      normalizedName.includes("generator"))
  ) {
    return ["topic_id", "long_form"];
  }

  if (name.includes("topic gap") && name.includes("finder")) {
    return ["topic_gaps", "content_seeds"];
  }

  if (name.includes("topic selector")) {
    return ["selected_topic"];
  }

  if (name.includes("insight extractor") || name.includes("inside extractor")) {
    return ["insights"];
  }

  if (name.includes("repurpose machine")) {
    return ["topic_id", "videos"];
  }

  if (name.includes("content generator")) {
    return ["contents"];
  }

  return [];
}

interface WorkflowDesignClientProps {
  workflow: Workflow | null;
}

type StepStatus = "pending" | "running" | "done" | "error";

interface UIStep extends WorkflowStep {
  status: StepStatus;
  output?: any;
  executionStep?: WorkflowExecutionStep;
  agentName?: string;
}

type ActiveTab = "preview" | "json" | "logs";

export function WorkflowDesignClient({ workflow }: WorkflowDesignClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const [workflowName, setWorkflowName] = useState(workflow?.name || "");
  const [isEditingName, setIsEditingName] = useState(false);

  // Page-level mode: design vs execute
  const [mode, setMode] = useState<"design" | "execute">("design");

  const [steps, setSteps] = useState<UIStep[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("preview");

  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [showAgentModal, setShowAgentModal] = useState(false);

  // Drag state for step reordering
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);

  const activeStep = useMemo(
    () => steps.find((s) => s.id === activeStepId) ?? null,
    [steps, activeStepId],
  );

  const completedCount = steps.filter((s) => s.status === "done").length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
  const isExecutionRunning = execution?.status === "running";

  useEffect(() => {
    setWorkflowName(workflow?.name || "");
  }, [workflow]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!workflow) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [stepsRes, agentsRes] = await Promise.all([
          listWorkflowSteps(workflow.id),
          listAgents(),
        ]);
        if (cancelled) return;

        const uiSteps: UIStep[] = stepsRes
          .slice()
          .sort((a, b) => a.step_number - b.step_number)
          .map((step) => ({
            ...step,
            status: "pending" as StepStatus,
            agentName: agentsRes.find((a) => a.id === step.agent_id)?.name,
          }));

        setAgents(agentsRes);
        setSteps(uiSteps);
        // Default: all nodes collapsed (no active step)
        setActiveStepId(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [workflow]);

  const mapExecutionStatus = (status: string): StepStatus => {
    switch (status) {
      case "running":
        return "running";
      case "success":
      case "approved":
      case "completed":
        return "done";
      case "failed":
      case "rejected":
        return "error";
      default:
        return "pending";
    }
  };

  const refreshExecutionSteps = async (exec: WorkflowExecution) => {
    const execSteps = await listExecutionSteps(exec.id);

    setSteps((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s] as const));
      for (const es of execSteps) {
        if (!es.step_id) continue;
        const step = byId.get(es.step_id);
        if (!step) continue;
        const status = mapExecutionStatus(es.status);
        byId.set(step.id, {
          ...step,
          status,
          output: es.output,
          executionStep: es,
        });
      }
      return Array.from(byId.values()).sort((a, b) => a.step_number - b.step_number);
    });
  };

  const handleRunWorkflow = async () => {
    if (!workflow) return;
    // Switch to execute mode when starting a run
    setMode("execute");
    setRunning(true);
    setSaving(true);
    try {
      const exec = await runWorkflow(workflow.id, { input: {} });
      setExecution(exec);
      await refreshExecutionSteps(exec);
    } catch (e) {
      console.error(e);
      alert("Không thể chạy workflow. Vui lòng kiểm tra cấu hình.");
    } finally {
      setRunning(false);
      setSaving(false);
    }
  };

  const handleAddAgentToFlow = async (agent: Agent) => {
    if (!workflow) return;
    setSaving(true);
    try {
      const maxOrder = steps.reduce((max, s) => Math.max(max, s.step_number), 0);
      const newStep = await createWorkflowStep(workflow.id, {
        step_number: maxOrder + 1,
        name: agent.name,
        type: "AGENT",
        agent_id: agent.id,
        requires_approval: false,
        config: {},
      });

      setSteps((prev) =>
        [...prev, { ...newStep, status: "pending" as StepStatus, agentName: agent.name }].sort(
          (a, b) => a.step_number - b.step_number,
        ),
      );
      setActiveStepId(newStep.id);
      setShowAgentModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddInputNode = async () => {
    if (!workflow) return;

    // If an Input (Generic) node already exists, just focus it
    const existingInput = steps.find(
      (s) => s.type === "GENERIC" && s.name.toLowerCase() === "input",
    );
    if (existingInput) {
      setActiveStepId(existingInput.id);
      setShowAgentModal(false);
      return;
    }

    setSaving(true);
    try {
      const maxOrder = steps.reduce((max, s) => Math.max(max, s.step_number), 0);
      const newStep = await createWorkflowStep(workflow.id, {
        step_number: maxOrder + 1,
        name: "Input",
        type: "GENERIC",
        agent_id: null,
        requires_approval: false,
        config: {},
      });

      // Append new Input step then move it to the top via reorder
      const withNew: UIStep[] = [
        ...steps,
        { ...newStep, status: "pending" as StepStatus, agentName: undefined },
      ];
      setSteps(withNew);
      setActiveStepId(newStep.id);
      setShowAgentModal(false);

      // Reorder to make Input the first step, if there were existing steps
      if (steps.length > 0) {
        await handleReorderSteps(newStep.id, steps[0].id);
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePause = () => {
    alert("Pause is not implemented yet – sẽ thêm sau.");
  };

  const handleEditOutput = () => {
    if (!activeStep?.output) {
      alert("Chưa có output để chỉnh sửa.");
      return;
    }
    alert("Edit Output UI sẽ dùng Tiptap sau – hiện là bản preview.");
  };

  const handleRegenerate = () => {
    alert("Regenerate chỉ step hiện tại sẽ được thêm ở bản tiếp theo.");
  };

  const handleStopWorkflow = async () => {
    if (!execution) return;
    try {
      const updated = await cancelExecution(execution.id);
      setExecution(updated);
      await refreshExecutionSteps(updated);
    } catch (e) {
      console.error(e);
      alert("Không thể dừng workflow hiện tại.");
    }
  };

  const handleSaveWorkflowName = async () => {
    if (!workflow) return;
    const trimmed = workflowName.trim();

    if (!trimmed) {
      setWorkflowName(workflow.name);
      setIsEditingName(false);
      return;
    }

    if (trimmed === workflow.name) {
      setIsEditingName(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateWorkflow(workflow.id, {
        name: trimmed,
        description: workflow.description ?? undefined,
      });
      setWorkflowName(updated.name);
    } catch (e) {
      console.error(e);
      alert("Không thể cập nhật tên workflow.");
      setWorkflowName(workflow.name);
    } finally {
      setSaving(false);
      setIsEditingName(false);
    }
  };

  const handleReorderSteps = async (sourceId: string, targetId: string) => {
    if (!workflow) return;
    if (sourceId === targetId) return;

    const ordered = steps.slice().sort((a, b) => a.step_number - b.step_number);
    const sourceIndex = ordered.findIndex((s) => s.id === sourceId);
    const targetIndex = ordered.findIndex((s) => s.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);

    const reordered = ordered.map((s, index) => ({
      ...s,
      step_number: index + 1,
    }));

    setSteps(reordered);

    setSaving(true);
    try {
      await Promise.all(
        reordered.map((s, index) =>
          updateWorkflowStep(workflow.id, s.id, { step_number: index + 1 }),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center bg-background-dark text-white">
        <p>Workflow không tồn tại hoặc đã bị xoá.</p>
      </div>
    );
  }

  const breadcrumbName = workflowName || "Workflow";

  return (
    <div className="flex h-full w-full flex-col bg-background-dark text-white font-display overflow-hidden">
      {/* Top navbar */}
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#282b39] bg-background-dark/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button className="lg:hidden text-[#9da1b9] hover:text-white">
            <span className="material-symbols-outlined">menu</span>
          </button>
          <div className="flex items-center gap-2 text-[#9da1b9] text-sm">
            <span>Workflows</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-white font-medium truncate max-w-[240px]" title={breadcrumbName}>
              {breadcrumbName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden sm:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9da1b9] text-[20px]">
              search
            </span>
            <input
              className="h-9 w-64 rounded-lg border-none bg-[#282b39] pl-10 pr-4 text-sm text-white placeholder-[#9da1b9] focus:ring-2 focus:ring-primary/50"
              placeholder="Search logs..."
              type="text"
            />
          </div>
          <button className="flex size-9 items-center justify-center rounded-lg bg-[#282b39] text-white hover:bg-[#3b3f54] transition-colors relative">
            <span className="absolute top-2 right-2 size-2 rounded-full bg-red-500 border border-[#282b39]" />
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>
          <div
            className="bg-center bg-no-repeat bg-cover rounded-full size-9 ring-2 ring-[#282b39]"
            style={{
              backgroundImage:
                "url(https://lh3.googleusercontent.com/aida-public/AB6AXuDFLfzuhF4zLE5UQKPitZJEJ-osSudx_G85DjvZH6mMbBhFrdnn4lWuPsl6etgAHSEN1s7FGG-obSa_gi5tAHCc9ZL65zazUI4tAxVDz1YNps3HwRGZs0kOpnbLMRyMA3Ilfeqpa0s7ps0HMLAFB9YGjPCEBhAypKn2AF_BhLhq5e104x8jHdNLyVjXCLz-RuAI1v19BRB-1LQZ-zk5AqSz2NDKfGS_lLsYdf56150dnARXitkyRX9UiIoyrc-XyL8uMsVCDYxkIrmm)",
            }}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-7xl flex flex-col gap-6">
          {/* Header + controls */}
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                  {isEditingName ? (
                    <input
                      className="text-3xl font-bold tracking-tight text-white bg-transparent border-b border-primary focus:outline-none max-w-[360px]"
                      value={workflowName}
                      autoFocus
                      onChange={(e) => setWorkflowName(e.target.value)}
                      onBlur={handleSaveWorkflowName}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveWorkflowName();
                        } else if (e.key === "Escape") {
                          setWorkflowName(workflow.name);
                          setIsEditingName(false);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-3xl font-bold tracking-tight text-white truncate max-w-[360px] text-left hover:text-primary transition-colors"
                      title={workflowName || "New Workflow"}
                      onClick={() => setIsEditingName(true)}
                    >
                      {workflowName || "New Workflow"}
                    </button>
                  )}
                <span className="inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20 animate-pulse">
                    {mode === "design" ? "Design Mode" : execution ? execution.status ?? "Running" : "Running"}
                </span>
              </div>
              <p className="text-[#9da1b9] text-sm font-normal">
                Project ID {workflow.project_id} • {execution ? "Last run just now" : "Not executed yet"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="flex h-10 items-center gap-2 rounded-lg border border-[#282b39] bg-transparent px-4 text-sm font-semibold text-white hover:bg-[#282b39] transition-colors">
                <span className="material-symbols-outlined text-[18px]">history</span>
                History
              </button>
              <button className="flex h-10 items-center gap-2 rounded-lg border border-[#282b39] bg-transparent px-4 text-sm font-semibold text-white hover:bg-[#282b39] transition-colors">
                <span className="material-symbols-outlined text-[18px]">tune</span>
                Config
              </button>
              {!isExecutionRunning ? (
                <button
                  type="button"
                  disabled={running || steps.length === 0}
                  onClick={handleRunWorkflow}
                  className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 shadow-lg shadow-blue-500/20"
                >
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                  Start Workflow
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopWorkflow}
                  className="flex h-10 items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 text-sm font-semibold text-red-500 hover:bg-red-500/20 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">stop_circle</span>
                  Stop Workflow
                </button>
              )}
            </div>
          </div>

          {/* Overall progress */}
          <div className="flex flex-col gap-2 rounded-xl bg-surface-dark p-4 border border-[#282b39]">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-white">Overall Progress</span>
              <span className="text-primary font-bold">{progressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#282b39]">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Steps + Document canvas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-320px)] min-h-[600px]">
            {/* Left steps panel: only draggable in design mode */}
            {/* Steps panel */}
            <div className="lg:col-span-4 flex flex-col rounded-xl border border-[#282b39] bg-surface-dark overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#282b39] p-4 bg-surface-darker">
                <h3 className="font-semibold text-white">Workflow Steps</h3>
                <span className="text-xs text-[#9da1b9]">{steps.length} Steps</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-0" id="workflow-steps-list">
                {steps.map((step, index) => {
                  const isActive = activeStepId === step.id;
                  const isDone = step.status === "done";
                  const isRunning = step.status === "running";
                  const isError = step.status === "error";

                  const baseConnectorColor = isDone || isRunning ? "bg-primary/30" : "bg-[#282b39]";

                  return (
                    <div
                      key={step.id}
                      className="relative pl-8 pb-6 last:pb-0 group"
                      onDragOver={(e) => {
                        if (mode !== "design") return;
                        if (!draggingStepId || draggingStepId === step.id) return;
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        if (mode !== "design") return;
                        e.preventDefault();
                        if (!draggingStepId) return;
                        const sourceId = draggingStepId;
                        setDraggingStepId(null);
                        handleReorderSteps(sourceId, step.id);
                      }}
                    >
                      {index < steps.length - 1 && (
                        <div className={`absolute left-[11px] top-8 h-full w-[2px] ${baseConnectorColor}`} />
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setActiveStepId((prev) => (prev === step.id ? null : step.id))
                        }
                        draggable={mode === "design"}
                        onDragStart={(e) => {
                          if (mode !== "design") return;
                          setDraggingStepId(step.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggingStepId(null);
                        }}
                        className={`flex items-start justify-between rounded-lg p-3 w-full text-left transition-colors relative group/card ${
                          isActive
                            ? "bg-primary/10 border border-primary/40 shadow-lg shadow-primary/10"
                            : "hover:bg-[#282b39]/50"
                        }`}
                      >
                        <div className="absolute left-0 top-1 flex size-6 items-center justify-center rounded-full ring-4 ring-surface-dark z-10">
                          {isDone && (
                            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-white">
                              <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                            </span>
                          )}
                          {isRunning && (
                            <span className="flex size-6 items-center justify-center rounded-full bg-surface-dark border-2 border-primary text-primary animate-pulse">
                              <span className="size-2 rounded-full bg-primary" />
                            </span>
                          )}
                          {!isDone && !isRunning && !isError && (
                            <span className="flex size-6 items-center justify-center rounded-full bg-[#282b39] text-[#9da1b9]">
                              <span className="size-2 rounded-full bg-[#565b73]" />
                            </span>
                          )}
                          {isError && (
                            <span className="flex size-6 items-center justify-center rounded-full bg-red-500 text-white">
                              <span className="material-symbols-outlined text-[14px]">warning</span>
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 ml-2 flex-1">
                          <div className="size-10 rounded-lg bg-[#282b39] flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary">smart_toy</span>
                          </div>
                          <div>
                            <p className="font-medium text-white text-sm truncate max-w-[180px]" title={step.name}>
                              {step.name}
                            </p>
                            <p className="text-xs text-[#9da1b9] truncate max-w-[180px]">
                              Agent: {step.agentName ?? "(chưa gắn agent)"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded whitespace-nowrap ${
                              isDone
                                ? "text-green-400 bg-green-400/10"
                                : isRunning
                                ? "text-primary bg-primary/10"
                                : isError
                                ? "text-red-400 bg-red-400/10"
                                : "text-[#9da1b9] bg-[#282b39]"
                            }`}
                          >
                            {isDone
                              ? "Done"
                              : isRunning
                              ? "Running"
                              : isError
                              ? "Error"
                              : "Pending"}
                          </span>
                          {/* Drag handle indicator */}
                          {mode === "design" && (
                            <span className="text-[#565b73] text-lg cursor-grab select-none">::</span>
                          )}
                        </div>
                      </button>

                      {/* Expanded area under a step */}
                      {isActive && step.type === "GENERIC" && (
                        <div className="mt-3 ml-8 mr-2 rounded-lg border border-[#282b39] bg-[#151722] p-3 text-xs text-[#d4d6e6]">
                          <p className="mb-2 text-[11px] text-[#9da1b9]">
                            This input will be provided to the next agent in the flow.
                          </p>
                          <textarea
                            className="w-full rounded-md border border-[#3b3f54] bg-[#0f1116] px-3 py-2 text-xs text-white placeholder:text-[#5c6076] focus:outline-none focus:ring-1 focus:ring-primary"
                            rows={4}
                            placeholder="Nhập nội dung đầu vào cho workflow..."
                            value={(step.config?.input_text as string) ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setSteps((prev) =>
                                prev.map((s) =>
                                  s.id === step.id
                                    ? {
                                        ...s,
                                        config: {
                                          ...(s.config || {}),
                                          input_text: value,
                                        },
                                      }
                                    : s,
                                ),
                              );
                            }}
                            onBlur={async () => {
                              if (!workflow) return;
                              const current = steps.find((s) => s.id === step.id);
                              if (!current) return;
                              try {
                                await updateWorkflowStep(workflow.id, step.id, {
                                  config: current.config,
                                });
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                          />
                        </div>
                      )}

                      {isActive && step.type === "AGENT" && (
                        <div className="mt-3 ml-8 mr-2 rounded-lg border border-[#282b39] bg-[#151722] p-3 text-xs text-[#d4d6e6] flex flex-col gap-3">
                          <div>
                            <p className="mb-1 text-[11px] font-semibold text-[#9da1b9]">Input objects</p>
                            {(() => {
                              let availableKeys: string[] = [];

                              // 1) Khi đã có executionStep.input (sau khi chạy) thì ưu tiên dùng
                              if (
                                step.executionStep?.input &&
                                typeof step.executionStep.input === "object" &&
                                !Array.isArray(step.executionStep.input)
                              ) {
                                availableKeys = Object.keys(
                                  step.executionStep.input as Record<string, unknown>,
                                );
                              } else {
                                // 2) Mode thiết kế: suy ra từ Generic Input + output/output_schema của các bước trước
                                const stepIndex = steps.findIndex((s) => s.id === step.id);
                                if (stepIndex > 0) {
                                  const merged: Record<string, unknown> = {};

                                  for (let i = 0; i < stepIndex; i += 1) {
                                    const prev = steps[i];

                                    // 2.a) Lấy keys từ Generic Input (config.input_text) nếu có
                                    if (prev.type === "GENERIC") {
                                      const rawText = (prev.config as any)?.input_text;
                                      if (typeof rawText === "string" && rawText.trim()) {
                                        try {
                                          const parsed = JSON.parse(rawText);
                                          if (
                                            parsed &&
                                            typeof parsed === "object" &&
                                            !Array.isArray(parsed)
                                          ) {
                                            Object.assign(
                                              merged,
                                              parsed as Record<string, unknown>,
                                            );
                                          }
                                        } catch {
                                          // ignore parse error, chỉ dùng được khi là JSON hợp lệ
                                        }
                                      }
                                    }

                                    // 2.b) Lấy keys từ output thực tế nếu đã từng chạy
                                    if (
                                      prev.output &&
                                      typeof prev.output === "object" &&
                                      !Array.isArray(prev.output)
                                    ) {
                                      Object.assign(
                                        merged,
                                        prev.output as Record<string, unknown>,
                                      );
                                    } else if (prev.type === "AGENT" && prev.agent_id) {
                                      // 2.c) Hoặc lấy từ output_schema hoặc default keys theo loại Agent
                                      const agentDef = agents.find((a) => a.id === prev.agent_id);
                                      const keys = getAgentOutputKeys(agentDef);
                                      for (const key of keys) {
                                        if (!(key in merged)) {
                                          merged[key] = null;
                                        }
                                      }
                                    }
                                  }

                                  availableKeys = Object.keys(merged);
                                }
                              }

                              if (availableKeys.length === 0) {
                                return (
                                  <>
                                    <p className="text-[11px] text-[#5c6076]">
                                      Chưa có input JSON cho step này.
                                    </p>
                                    <p className="mt-1 text-[10px] text-[#5c6076]">
                                      (Sau khi chạy workflow và các bước trước đó có
                                      output JSON, các object sẽ hiện ở đây để bạn chọn.)
                                    </p>
                                  </>
                                );
                              }

                              return (
                                <div className="flex flex-wrap gap-1">
                                  {availableKeys.map((key) => {
                                  const selected = Array.isArray((step.config as any)?.selected_inputs)
                                    ? ((step.config as any).selected_inputs as string[]).includes(key)
                                    : false;
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={async (event) => {
                                        event.stopPropagation();
                                        const prevSelected = Array.isArray((step.config as any)?.selected_inputs)
                                          ? ((step.config as any).selected_inputs as string[])
                                          : [];
                                        const nextSelected = selected
                                          ? prevSelected.filter((k) => k !== key)
                                          : [...prevSelected, key];

                                        setSteps((prev) =>
                                          prev.map((s) =>
                                            s.id === step.id
                                              ? {
                                                  ...s,
                                                  config: {
                                                    ...(s.config || {}),
                                                    selected_inputs: nextSelected,
                                                  },
                                                }
                                              : s,
                                          ),
                                        );

                                        if (workflow) {
                                          try {
                                            await updateWorkflowStep(workflow.id, step.id, {
                                              config: {
                                                ...(step.config || {}),
                                                selected_inputs: nextSelected,
                                              },
                                            });
                                          } catch (e) {
                                            console.error(e);
                                          }
                                        }
                                      }}
                                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                                        selected
                                          ? "border-primary bg-primary/10 text-primary"
                                          : "border-[#3b3f54] bg-[#0f1116] text-[#d4d6e6] hover:border-primary/60 hover:text-primary"
                                      }`}
                                    >
                                      {key}
                                    </button>
                                  );
                                })}
                                </div>
                              );
                            })()}
                            <p className="mt-1 text-[10px] text-[#5c6076]">
                              (Nhấn vào chip để chọn/bỏ chọn các object sẽ đưa vào
                              input của agent.)
                            </p>
                          </div>

                          <div>
                            <p className="mb-1 text-[11px] font-semibold text-[#9da1b9]">Output objects</p>
                            {(() => {
                              let outputSource: any = null;
                              if (
                                step.output &&
                                typeof step.output === "object" &&
                                !Array.isArray(step.output)
                              ) {
                                outputSource = step.output;
                              } else if (
                                step.executionStep?.output &&
                                typeof step.executionStep.output === "object" &&
                                !Array.isArray(step.executionStep.output)
                              ) {
                                outputSource = step.executionStep.output;
                              } else if (step.agent_id) {
                                // Mode thiết kế: nếu chưa có output runtime thì lấy từ output_schema
                                // hoặc default keys theo loại Agent
                                const agentDef = agents.find((a) => a.id === step.agent_id);
                                const keys = getAgentOutputKeys(agentDef);
                                if (keys.length > 0) {
                                  outputSource = keys.reduce<Record<string, unknown>>(
                                    (acc, key) => {
                                      acc[key] = null;
                                      return acc;
                                    },
                                    {},
                                  );
                                }
                              }

                              if (!outputSource) {
                                return (
                                  <p className="text-[11px] text-[#5c6076]">
                                    Chưa có output JSON cho step này.
                                  </p>
                                );
                              }

                              return (
                                <div className="flex flex-wrap gap-1">
                                  {Object.keys(outputSource as Record<string, unknown>).map((key) => (
                                    <span
                                      key={key}
                                      className="inline-flex items-center rounded-full border border-[#3b3f54] bg-[#0f1116] px-2 py-0.5 text-[10px] text-[#d4d6e6]"
                                    >
                                      {key}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {steps.length === 0 && !loading && (
                  <p className="text-xs text-[#9da1b9]">Chưa có step nào trong workflow này.</p>
                )}
              </div>
              <div className="p-4 border-t border-[#282b39] bg-surface-darker">
                <button
                  type="button"
                  onClick={() => setShowAgentModal(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#565b73] bg-[#282b39]/30 py-3 text-sm font-semibold text-[#9da1b9] hover:bg-[#282b39]/60 hover:text-white transition-all hover:border-primary/50"
                >
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                  Add Agent to Flow
                </button>
              </div>
            </div>

            {/* Document canvas */}
            <div className="lg:col-span-8 flex flex-col rounded-xl border border-[#282b39] bg-surface-dark overflow-hidden relative">
              <div className="flex items-center justify-between border-b border-[#282b39] bg-surface-darker px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-[24px]">terminal</span>
                  <span className="font-mono text-sm font-medium text-white">Agent Output Stream</span>
                </div>
                <div className="flex bg-[#282b39] rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("preview")}
                    className={`px-3 py-1 text-xs font-bold rounded ${
                      activeTab === "preview"
                        ? "bg-primary text-white shadow-sm"
                        : "text-[#9da1b9] hover:text-white"
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("json")}
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      activeTab === "json"
                        ? "bg-primary text-white shadow-sm"
                        : "text-[#9da1b9] hover:text-white"
                    }`}
                  >
                    Raw JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("logs")}
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      activeTab === "logs"
                        ? "bg-primary text-white shadow-sm"
                        : "text-[#9da1b9] hover:text-white"
                    }`}
                  >
                    Logs
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 font-mono text-sm leading-relaxed text-[#d4d6e6] bg-[#0f1116]">
                {!activeStep && <p className="text-[#5c6076]">Chọn một step bên trái để xem output.</p>}

                {activeStep && activeTab === "preview" && (
                  <div className="space-y-4 font-sans">
                    {!activeStep.output && (
                      <p className="text-[#5c6076] text-sm">
                        Chưa có output cho step này. Bấm "Run Workflow" để chạy.
                      </p>
                    )}
                    {typeof activeStep.output === "string" && activeStep.output && (
                      <p className="text-base text-slate-100 whitespace-pre-line">{activeStep.output}</p>
                    )}
                    {activeStep.output &&
                      typeof activeStep.output === "object" &&
                      !Array.isArray(activeStep.output) && (
                        (() => {
                          const keys = Object.keys(activeStep.output as Record<string, unknown>);
                          const hasOnlyRawOutput =
                            keys.length === 1 &&
                            keys[0] === "raw_output" &&
                            typeof (activeStep.output as any).raw_output === "string";

                          if (hasOnlyRawOutput) {
                            return (
                              <p className="text-base text-slate-100 whitespace-pre-line">
                                {(activeStep.output as any).raw_output}
                              </p>
                            );
                          }

                          return (
                            <pre className="text-xs bg-[#111827] rounded-lg p-4 overflow-x-auto border border-[#1f2937]">
                              {JSON.stringify(activeStep.output, null, 2)}
                            </pre>
                          );
                        })()
                      )}
                  </div>
                )}

                {activeStep && activeTab === "json" && (
                  <pre className="text-xs bg-[#111827] rounded-lg p-4 overflow-x-auto border border-[#1f2937]">
                    {JSON.stringify(activeStep.output ?? {}, null, 2)}
                  </pre>
                )}

                {activeStep && activeTab === "logs" && (
                  <div className="space-y-2 text-xs">
                    <p>
                      Step status: <span className="text-primary">{activeStep.status}</span>
                    </p>
                    {activeStep.executionStep?.error && (
                      <p className="text-red-400">Error: {activeStep.executionStep.error}</p>
                    )}
                    {!activeStep.executionStep && (
                      <p className="text-[#5c6076]">Chưa có log cho step này.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer controls */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-[#3b3f54] bg-[#1a1d2d]/90 p-1.5 shadow-2xl backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handlePause}
                  className="flex size-9 items-center justify-center rounded-full bg-[#282b39] text-white hover:bg-[#3b3f54] hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">pause</span>
                </button>
                <div className="h-4 w-px bg-[#3b3f54] mx-1" />
                <button
                  type="button"
                  onClick={handleEditOutput}
                  className="flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                  Edit Output
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="flex h-9 items-center gap-2 rounded-full bg-[#282b39] px-4 text-sm font-bold text-white hover:bg-[#3b3f54] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                  Regenerate
                </button>
              </div>
            </div>
          </div>

          {/* Run workflow button (bottom helper) */}
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={handleRunWorkflow}
              disabled={running || steps.length === 0}
              className="flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white hover:bg-blue-600 transition-colors disabled:opacity-60 shadow-lg shadow-blue-500/20"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              {running ? "Starting..." : "Start Workflow"}
            </button>
          </div>
        </div>
      </main>

      {/* Add Agent modal */}
      {showAgentModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-xl bg-surface-dark border border-[#282b39] shadow-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Add Agent to Flow</h2>
              <button
                type="button"
                onClick={() => setShowAgentModal(false)}
                className="text-[#9da1b9] hover:text-white"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="text-xs text-[#9da1b9] mb-3">
              Chọn một agent để chèn vào cuối workflow. (Vị trí và config chi tiết sẽ chỉnh sau.)
            </p>
            <div className="max-h-80 overflow-y-auto space-y-2">
              <button
                type="button"
                onClick={handleAddInputNode}
                className="w-full flex items-start gap-3 rounded-lg border border-dashed border-[#565b73] bg-[#151722] px-3 py-2 text-left hover:border-primary/60 hover:bg-[#1a1d2d] transition-colors mb-2"
              >
                <div className="size-9 rounded-lg bg-[#282b39] flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">input</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">Input</p>
                  <p className="text-xs text-[#9da1b9] line-clamp-2">
                    Generic system node dùng để nhập dữ liệu đầu vào cho workflow.
                  </p>
                </div>
              </button>

              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => handleAddAgentToFlow(agent)}
                  className="w-full flex items-start gap-3 rounded-lg border border-[#282b39] bg-[#151722] px-3 py-2 text-left hover:border-primary/40 hover:bg-[#1a1d2d] transition-colors"
                >
                  <div className="size-9 rounded-lg bg-[#282b39] flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate" title={agent.name}>
                      {agent.name}
                    </p>
                    {agent.description && (
                      <p className="text-xs text-[#9da1b9] line-clamp-2">{agent.description}</p>
                    )}
                  </div>
                </button>
              ))}
              {agents.length === 0 && (
                <p className="text-xs text-[#9da1b9]">Chưa có agent nào. Hãy tạo agent trước.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
