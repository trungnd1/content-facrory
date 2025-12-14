"use client";

import { useEffect, useMemo, useState } from "react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { formatAgentOutputToMarkdown } from "@/lib/previewFormat";
import {
  Agent,
  Workflow,
  WorkflowExecution,
  WorkflowExecutionStep,
  WorkflowStep,
  createWorkflowStep,
  cancelExecution,
  getAgent,
  getExecution,
  listAgents,
  listExecutionSteps,
  listWorkflowSteps,
  runWorkflow,
  updateWorkflowWcs,
  updateWorkflow,
  updateWorkflowStep,
} from "@/lib/api";

type WorkflowConfig = Record<string, Record<string, any>>;

function tryParseLooseJsonValue(text: string): any | null {
  if (!text) return null;

  // Strip markdown fences if present
  const withoutFences = text.replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, "$1");

  // Remove JS-style comments (common in prompts)
  const withoutComments = withoutFences
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  // Remove trailing commas before } or ] (JSON5-like prompts)
  const withoutTrailingCommas = withoutComments.replace(/,\s*([}\]])/g, "$1");

  // Quote unquoted keys: { foo: 1 } or , foo: 1  -> { "foo": 1 }
  // This keeps existing quoted keys untouched and helps parse "JSON-ish" configs.
  const normalized = withoutTrailingCommas.replace(/([\{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, "$1\"$2\"$3");

  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function tryParseLooseJsonObject(text: string): Record<string, any> | null {
  const parsed = tryParseLooseJsonValue(text);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, any>;
  }
  return null;
}

function coercePreviewTitleMap(value: any): any | undefined {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = tryParseLooseJsonValue(value.trim());
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return parsed;
  }
  return undefined;
}

function extractConfigFromPromptSystem(promptSystem?: string | null): Record<string, any> | null {
  if (!promptSystem) return null;

  const idx = promptSystem.toLowerCase().indexOf("input");
  if (idx === -1) return null;

  const start = promptSystem.indexOf("{", idx);
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < promptSystem.length; i += 1) {
    const ch = promptSystem[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;

  const jsonText = promptSystem.slice(start, end + 1);

  const parsed = tryParseLooseJsonObject(jsonText);
  const config = parsed?.config;
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return config as Record<string, any>;
  }

  return null;
}

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

type StepStatus = "pending" | "waiting" | "running" | "done" | "error";

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

  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig>({});
  const [showWcfModal, setShowWcfModal] = useState(false);
  const [workflowConfigDraft, setWorkflowConfigDraft] = useState<WorkflowConfig | null>(null);

  // Drag state for step reordering
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);

  const activeStep = useMemo(
    () => steps.find((s) => s.id === activeStepId) ?? null,
    [steps, activeStepId],
  );

  const activeStepPreviewTitleMap = useMemo(() => {
    // Preview ordering + display titles can be provided per agent via config.preview_title_map.
    // Priority:
    // 1) executionStep.input.config.preview_title_map (after running)
    // 2) workflow WCS config for this agent (design-time fallback)
    const fromExec = (activeStep as any)?.executionStep?.input?.config?.preview_title_map;
    const execCoerced = coercePreviewTitleMap(fromExec);
    if (execCoerced) return execCoerced;

    const agentId = activeStep?.agent_id ?? undefined;
    if (!agentId) return undefined;

    const fromWcs = (workflowConfig as any)?.[agentId]?.preview_title_map;
    const wcsCoerced = coercePreviewTitleMap(fromWcs);
    if (wcsCoerced) return wcsCoerced;

    return undefined;
  }, [activeStep?.id, activeStep?.agent_id, (activeStep as any)?.executionStep?.input, workflowConfig]);

  const previewMarkdown = useMemo(() => {
    return formatAgentOutputToMarkdown(activeStep?.output, {
      previewTitleMap: activeStepPreviewTitleMap,
    });
  }, [activeStep?.output, activeStep?.id, activeStepPreviewTitleMap]);

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
        // Start from persisted WCS (if available) so user edits survive refresh.
        const persistedWcs = (workflow as any)?.wcs;
        if (!cancelled && persistedWcs && typeof persistedWcs === "object" && !Array.isArray(persistedWcs)) {
          setWorkflowConfig(persistedWcs as WorkflowConfig);
        }

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

        // Build per-workflow config schema by fetching each agent's system instruction
        // and extracting `config` from its INPUT schema.
        const orderedAgentIds = uiSteps
          .filter((s) => s.type === "AGENT" && s.agent_id)
          .map((s) => s.agent_id as string);
        const uniqueAgentIds = Array.from(new Set(orderedAgentIds));

        if (uniqueAgentIds.length > 0) {
          const pairs = await Promise.all(
            uniqueAgentIds.map(async (agentId) => {
              try {
                const agent = await getAgent(agentId);
                const cfg = extractConfigFromPromptSystem(agent.prompt_system);
                return [agentId, cfg] as const;
              } catch (e) {
                console.error("Failed to load agent for WCS", agentId, e);
                return [agentId, null] as const;
              }
            }),
          );

          if (!cancelled) {
            setWorkflowConfig((prev) => {
              const next: WorkflowConfig = { ...prev };
              for (const [agentId, cfg] of pairs) {
                if (!cfg) continue;
                // Preserve any existing user edits, but add new keys from schema defaults.
                next[agentId] = { ...cfg, ...(prev[agentId] ?? {}) };
              }
              return next;
            });
          }
        }
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
      case "waiting":
      case "queued":
      case "pending":
        return "waiting";
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
        return "waiting";
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

  const pollExecution = async (executionId: string) => {
    const terminalStatuses = new Set(["completed", "failed", "cancelled", "waiting_approval"]);

    // Simple polling loop: refresh execution + steps until we reach
    // a terminal status. This lets the UI show per-step state changes
    // while the backend orchestrator is still running.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const latest = await getExecution(executionId);
        setExecution(latest);
        await refreshExecutionSteps(latest);

        if (!latest.status || terminalStatuses.has(latest.status)) {
          break;
        }
      } catch (err) {
        console.error("Failed to poll execution", err);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  const handleRunWorkflow = async () => {
    if (!workflow) return;
    // Switch to execute mode when starting a run
    setMode("execute");

    // Reset UI step states for a fresh run:
    // - Agent steps go to `waiting`
    // - Clear any previous outputs/executionStep pointers
    setSteps((prev) =>
      prev
        .map((s) => {
          if (s.type === "AGENT") {
            return {
              ...s,
              status: "waiting" as StepStatus,
              output: undefined,
              executionStep: undefined,
            };
          }
          return {
            ...s,
            status: "pending" as StepStatus,
            output: undefined,
            executionStep: undefined,
          };
        })
        .sort((a, b) => a.step_number - b.step_number),
    );

    setRunning(true);
    setSaving(true);
    try {
      const exec = await runWorkflow(workflow.id, {
        input: {
          __workflow_wcs: workflowConfig,
        },
      });
      setExecution(exec);
      await refreshExecutionSteps(exec);
      await pollExecution(exec.id);
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

  const openWcfModal = () => {
    // Flat key/value configs, safe to clone via JSON.
    const draft = JSON.parse(JSON.stringify(workflowConfig || {})) as WorkflowConfig;
    setWorkflowConfigDraft(draft);
    setShowWcfModal(true);
  };

  const closeWcfModal = () => {
    setShowWcfModal(false);
    setWorkflowConfigDraft(null);
  };

  const saveWcfModal = async () => {
    if (!workflow) return;

    const nextWcs = (workflowConfigDraft ?? workflowConfig) as WorkflowConfig;

    setSaving(true);
    try {
      await updateWorkflowWcs(workflow.id, nextWcs);
      setWorkflowConfig(nextWcs);
      closeWcfModal();
    } catch (e) {
      console.error(e);
      alert("Không thể lưu Workflow Configuration Schema (WCS). Vui lòng thử lại.");
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
              <button
                type="button"
                onClick={openWcfModal}
                className="flex h-10 items-center gap-2 rounded-lg border border-[#282b39] bg-transparent px-4 text-sm font-semibold text-white hover:bg-[#282b39] transition-colors"
              >
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
                <button
                  type="button"
                  onClick={openWcfModal}
                  className="mb-4 flex w-full items-start justify-between rounded-lg border border-[#282b39] bg-[#151722] p-3 text-left hover:border-primary/40 hover:bg-[#1a1d2d] transition-colors"
                >
                  <div className="flex gap-3 flex-1">
                    <div className="size-10 rounded-lg bg-[#282b39] flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary">tune</span>
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm truncate max-w-[220px]">
                        Workflow Config (WCS)
                      </p>
                      <p className="text-xs text-[#9da1b9] truncate max-w-[220px]">
                        Per-agent config from INPUT schema
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded whitespace-nowrap text-[#9da1b9] bg-[#282b39]">
                    Edit
                  </span>
                </button>

                {steps.map((step, index) => {
                  const isActive = activeStepId === step.id;
                  const isDone = step.status === "done";
                  const isWaiting = step.status === "waiting";
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

                      {/* Status circle, aligned with the left connector line */}
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
                        className={`flex items-start justify-between rounded-lg p-3 w-full text-left transition-colors group/card ${
                          isActive
                            ? "bg-primary/10 border border-primary/40 shadow-lg shadow-primary/10"
                            : "hover:bg-[#282b39]/50"
                        }`}
                      >
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
                                : isWaiting
                                ? "text-[#9da1b9] bg-[#282b39]"
                                : isError
                                ? "text-red-400 bg-red-400/10"
                                : "text-[#9da1b9] bg-[#282b39]"
                            }`}
                          >
                            {isDone
                              ? "Done"
                              : isRunning
                              ? "Running"
                              : isWaiting
                              ? "Waiting"
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

                              // Always show a `config` input for agent steps.
                              // Even before execution, WCS provides per-agent config, so keep it visible.
                              availableKeys = [
                                "config",
                                ...availableKeys.filter((k) => k !== "config"),
                              ];

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
                                  const isConfigKey = key === "config";
                                  const selected = isConfigKey
                                    ? true
                                    : Array.isArray((step.config as any)?.selected_inputs)
                                      ? ((step.config as any).selected_inputs as string[]).includes(key)
                                      : false;
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      disabled={isConfigKey}
                                      onClick={async (event) => {
                                        if (isConfigKey) return;
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
                    {activeStep.output && previewMarkdown.trim() && (
                      <div className="rounded-lg border border-[#1f2937] bg-[#0b0d12] p-4">
                        <MarkdownPreview markdown={previewMarkdown} />
                      </div>
                    )}
                    {activeStep.output && !previewMarkdown.trim() && (
                      <p className="text-[#5c6076] text-sm">Không có nội dung để preview.</p>
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

      {/* WCF modal */}
      {showWcfModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-2xl rounded-xl bg-surface-dark border border-[#282b39] shadow-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Workflow Configuration Schema (WCS)</h2>
              <button
                type="button"
                onClick={closeWcfModal}
                className="text-[#9da1b9] hover:text-white"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="text-xs text-[#9da1b9] mb-3">
              WCS được lấy từ INPUT schema (trường <span className="text-white">config</span>) của từng agent.
            </p>

            <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
              {(() => {
                const orderedAgentIds = steps
                  .filter((s) => s.type === "AGENT" && s.agent_id)
                  .map((s) => s.agent_id as string);
                const uniqueAgentIds = Array.from(new Set(orderedAgentIds));

                if (uniqueAgentIds.length === 0) {
                  return <p className="text-xs text-[#9da1b9]">Workflow chưa có agent nào.</p>;
                }

                return uniqueAgentIds.map((agentId) => {
                  const agentName =
                    agents.find((a) => a.id === agentId)?.name ?? `Agent ${agentId}`;
                  const cfg = (workflowConfigDraft ?? workflowConfig)[agentId] ?? {};
                  const rawKeys = Object.keys(cfg);
                  const keys = rawKeys.filter((k) => k !== "preview_title_map");

                  return (
                    <div key={agentId} className="rounded-lg border border-[#282b39] bg-[#151722] p-3">
                      <p className="text-xs font-semibold text-white mb-2">{agentName}</p>
                      {rawKeys.length === 0 ? (
                        <p className="text-xs text-[#9da1b9]">
                          Không tìm thấy <span className="text-white">config</span> trong INPUT schema của agent này.
                        </p>
                      ) : keys.length === 0 ? (
                        <p className="text-xs text-[#9da1b9]">Không có trường cấu hình nào để chỉnh trong WCS.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {keys.map((key) => {
                            const value = cfg[key];
                            const valueType = typeof value;

                            return (
                              <label key={key} className="block">
                                <span className="block text-[11px] font-semibold text-[#9da1b9] mb-1">{key}</span>
                                {valueType === "boolean" ? (
                                  <input
                                    type="checkbox"
                                    checked={Boolean(value)}
                                    onChange={(e) => {
                                      const nextVal = e.target.checked;
                                      setWorkflowConfigDraft((prev) => {
                                        const base = prev ?? (JSON.parse(JSON.stringify(workflowConfig)) as WorkflowConfig);
                                        return {
                                          ...base,
                                          [agentId]: {
                                            ...(base[agentId] ?? {}),
                                            [key]: nextVal,
                                          },
                                        };
                                      });
                                    }}
                                    className="h-4 w-4 accent-primary"
                                  />
                                ) : (
                                  <input
                                    type={valueType === "number" ? "number" : "text"}
                                    value={value ?? ""}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const nextVal = valueType === "number" ? (raw === "" ? "" : Number(raw)) : raw;
                                      setWorkflowConfigDraft((prev) => {
                                        const base = prev ?? (JSON.parse(JSON.stringify(workflowConfig)) as WorkflowConfig);
                                        return {
                                          ...base,
                                          [agentId]: {
                                            ...(base[agentId] ?? {}),
                                            [key]: nextVal,
                                          },
                                        };
                                      });
                                    }}
                                    className="w-full rounded-md border border-[#3b3f54] bg-[#0f1116] px-3 py-2 text-xs text-white placeholder:text-[#5c6076] focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeWcfModal}
                className="h-9 rounded-lg border border-[#282b39] bg-transparent px-4 text-xs font-semibold text-[#9da1b9] hover:bg-[#282b39]/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveWcfModal}
                disabled={saving}
                className="h-9 rounded-lg bg-primary px-4 text-xs font-bold text-white hover:bg-blue-600 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
