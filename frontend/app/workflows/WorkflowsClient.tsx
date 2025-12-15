"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { useProject } from "@/components/ProjectProvider";
import { formatAgentOutputToMarkdown } from "@/lib/previewFormat";
import {
    createWorkflowForProject,
    createWorkflowStep,
    deleteWorkflow,
    getAgent,
    getWorkflow,
    Workflow,
    WorkflowExecution,
    WorkflowExecutionStep,
    WorkflowStep,
    WorkflowWithLatestExecution,
    cancelExecution,
    getWorkflowLatestExecution,
    updateWorkflowOutputConfig,
    updateWorkflowStep,
    updateWorkflowWcs,
    listExecutionSteps,
    listWorkflowSteps,
    listWorkflowsWithLatestExecution,
    runWorkflow,
} from "@/lib/api";

type PanelTab = "preview" | "json";

type PreviewFontSize = "sm" | "md" | "lg";

type StatusBadge = {
    label: string;
    className: string;
};

type PreviewSection = {
    step_id: string;
    step_number: number;
    step_name: string;
    status: string;
    preview_title_map?: any;
    selected_outputs: Record<string, any>;
};

function formatRelativeTime(iso?: string): string {
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

function getExecutionStatusBadge(execution: WorkflowExecution | null): StatusBadge {
    if (!execution) {
        return {
            label: "Đã dừng",
            className:
                "inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-300 border border-slate-500/20",
        };
    }

    switch (execution.status) {
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
                label: execution.status,
                className:
                    "inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-300 border border-slate-500/20",
            };
    }
}

function normalizeStepStatus(status?: string | null): "waiting" | "running" | "done" | "error" {
    if (!status) return "waiting";
    const s = status.toLowerCase();
    if (s === "running") return "running";
    if (s === "success" || s === "completed" || s === "approved") return "done";
    if (s === "failed" || s === "rejected") return "error";
    if (s === "waiting_approval") return "waiting";
    return "waiting";
}

function tryParseJsonValue(value: any): any {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function normalizeMultilineText(text: string): string {
    return text
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
}

function extractJsonStringField(jsonLike: string, fieldName: string): string | null {
    // Best-effort extraction of a quoted JSON string field value even if the overall
    // payload isn't strict JSON (common with long_form raw text containing newlines).
    const s = jsonLike;
    const key = `"${fieldName}"`;
    const idx = s.indexOf(key);
    if (idx === -1) return null;

    let i = idx + key.length;
    while (i < s.length && s[i] !== ":") i += 1;
    if (i >= s.length || s[i] !== ":") return null;
    i += 1;
    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (i >= s.length || s[i] !== '"') return null;
    i += 1;

    let out = "";
    while (i < s.length) {
        const ch = s[i];

        if (ch === "\\") {
            if (i + 1 < s.length) {
                out += ch + s[i + 1];
                i += 2;
                continue;
            }
            out += ch;
            i += 1;
            continue;
        }

        if (ch === '"') {
            let j = i + 1;
            while (j < s.length && /\s/.test(s[j])) j += 1;
            const next = j < s.length ? s[j] : "";
            if (next === "}" || next === "]") break;
            if (next === ",") {
                let k = j + 1;
                while (k < s.length && /\s/.test(s[k])) k += 1;
                if (k < s.length && s[k] === '"') break;
            }
            out += '"';
            i += 1;
            continue;
        }

        out += ch;
        i += 1;
    }

    try {
        const decoded = JSON.parse(`"${out.replace(/"/g, "\\\"")}"`);
        return typeof decoded === "string" ? normalizeMultilineText(decoded) : String(decoded);
    } catch {
        const unescaped = out
            .replace(/\\\\/g, "\\")
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\n")
            .replace(/\\t/g, "\t");
        return normalizeMultilineText(unescaped);
    }
}

function extractPreferredPayloadFromJsonLike(jsonLike: string): any | null {
    const longForm = extractJsonStringField(jsonLike, "long_form");
    if (typeof longForm === "string" && longForm.trim()) {
        const topicId = extractJsonStringField(jsonLike, "topic_id");
        const out: Record<string, any> = { long_form: longForm };
        if (typeof topicId === "string" && topicId.trim()) out.topic_id = topicId;
        return out;
    }

    const markdown = extractJsonStringField(jsonLike, "markdown");
    if (typeof markdown === "string" && markdown.trim()) return markdown;

    const content = extractJsonStringField(jsonLike, "content");
    if (typeof content === "string" && content.trim()) return content;

    const raw = extractJsonStringField(jsonLike, "raw_output");
    if (typeof raw === "string" && raw.trim()) return raw;

    return null;
}

function tryParseLooseJson(text: string): any | null {
    if (!text) return null;
    const trimmed = text.trim();

    const withoutFences = trimmed.replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, "$1").trim();
    const withoutComments = withoutFences
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const normalized = withoutComments.replace(/,\s*([}\]])/g, "$1").trim();

    const extracted = extractPreferredPayloadFromJsonLike(normalized);
    if (extracted) return extracted;

    const first = normalized[0];
    if (first !== "{" && first !== "[" && first !== '"') return null;

    try {
        return JSON.parse(normalized);
    } catch {
        return null;
    }
}

function toObject(value: any): Record<string, any> | null {
    // 1) Parse string payloads (including JSON-ish LLM outputs)
    if (typeof value === "string") {
        const parsedLoose = tryParseLooseJson(value);
        if (parsedLoose && typeof parsedLoose === "object" && !Array.isArray(parsedLoose)) {
            return parsedLoose as Record<string, any>;
        }
    }

    // 2) Parse strict JSON strings
    const parsed = tryParseJsonValue(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, any>;

        // Common backend rescue shape: { raw_output: "{...json...}" }
        if (typeof obj.raw_output === "string" && obj.raw_output.trim()) {
            const inner = tryParseLooseJson(obj.raw_output);
            if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Record<string, any>;
        }

        if (obj.raw_output && typeof obj.raw_output === "object" && !Array.isArray(obj.raw_output)) {
            return obj.raw_output as Record<string, any>;
        }

        return obj;
    }

    return null;
}

function coercePreviewTitleMap(value: any): any | undefined {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = tryParseLooseJson(value.trim()) ?? tryParseJsonValue(value.trim());
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
    const snippet = promptSystem.slice(start, end + 1).trim();
    const parsed = tryParseLooseJson(snippet) ?? tryParseJsonValue(snippet);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const cfg = (parsed as any).config;
        if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) return cfg as Record<string, any>;
    }
    return null;
}

function resolvePreviewTitleMapFromStepInput(stepInput: any): any | undefined {
    if (!stepInput) return undefined;

    // Common: input.config.preview_title_map
    const direct = stepInput?.config?.preview_title_map;
    const coercedDirect = coercePreviewTitleMap(direct);
    if (coercedDirect) return coercedDirect;

    // Some runs may store preview_title_map at top-level.
    const topLevel = stepInput?.preview_title_map;
    const coercedTop = coercePreviewTitleMap(topLevel);
    if (coercedTop) return coercedTop;

    // If input.config was serialized as a string, parse and retry.
    if (typeof stepInput?.config === "string" && stepInput.config.trim()) {
        const parsedConfig = tryParseLooseJson(stepInput.config.trim()) ?? tryParseJsonValue(stepInput.config.trim());
        const coercedParsed = coercePreviewTitleMap((parsedConfig as any)?.preview_title_map);
        if (coercedParsed) return coercedParsed;

        // Rare nested wrapper: { config: { preview_title_map } }
        const coercedNested = coercePreviewTitleMap((parsedConfig as any)?.config?.preview_title_map);
        if (coercedNested) return coercedNested;
    }

    // Rare nested wrapper: input.config.config.preview_title_map
    const nested = stepInput?.config?.config?.preview_title_map;
    const coercedNested = coercePreviewTitleMap(nested);
    if (coercedNested) return coercedNested;

    return undefined;
}

function resolvePreviewTitleMapFromWcs(agentConfig: any): any | undefined {
    if (!agentConfig) return undefined;

    const direct = agentConfig?.preview_title_map;
    const coercedDirect = coercePreviewTitleMap(direct);
    if (coercedDirect) return coercedDirect;

    // Rare wrapper: { config: { preview_title_map } }
    const nested = agentConfig?.config?.preview_title_map;
    const coercedNested = coercePreviewTitleMap(nested);
    if (coercedNested) return coercedNested;

    // If persisted as a JSON-ish string.
    if (typeof direct === "string" && direct.trim()) {
        const parsed = tryParseLooseJson(direct.trim()) ?? tryParseJsonValue(direct.trim());
        const coercedParsed = coercePreviewTitleMap(parsed);
        if (coercedParsed) return coercedParsed;
    }

    return undefined;
}

function parsePath(path: string): Array<string | number> {
    // Supports dotted paths and bracket indices, e.g.
    // "a.b[0].c" -> ["a","b",0,"c"]
    const parts: Array<string | number> = [];
    let buf = "";
    for (let i = 0; i < path.length; i += 1) {
        const ch = path[i];
        if (ch === ".") {
            if (buf) parts.push(buf);
            buf = "";
            continue;
        }
        if (ch === "[") {
            if (buf) parts.push(buf);
            buf = "";
            const close = path.indexOf("]", i + 1);
            if (close === -1) break;
            const inside = path.slice(i + 1, close).trim();
            const n = Number(inside);
            if (Number.isFinite(n)) parts.push(n);
            i = close;
            continue;
        }
        buf += ch;
    }
    if (buf) parts.push(buf);
    return parts;
}

function getByPath(root: any, path: string): any {
    if (!path) return undefined;
    const segs = parsePath(path);
    let cur: any = root;
    for (const seg of segs) {
        if (cur == null) return undefined;
        if (typeof seg === "number") {
            if (!Array.isArray(cur)) return undefined;
            cur = cur[seg];
        } else {
            if (typeof cur !== "object") return undefined;
            cur = (cur as any)[seg];
        }
    }
    return cur;
}

function setByPath(target: any, path: string, value: any): void {
    if (!path) return;
    const segs = parsePath(path);
    if (segs.length === 0) return;

    let cur: any = target;
    for (let i = 0; i < segs.length; i += 1) {
        const seg = segs[i];
        const isLast = i === segs.length - 1;
        const nextSeg = !isLast ? segs[i + 1] : undefined;

        if (typeof seg === "number") {
            if (!Array.isArray(cur)) {
                // If target shape doesn't match, we can't safely set.
                return;
            }

            while (cur.length <= seg) cur.push(undefined);

            if (isLast) {
                cur[seg] = value;
                return;
            }

            if (cur[seg] == null || typeof cur[seg] !== "object") {
                cur[seg] = typeof nextSeg === "number" ? [] : {};
            }

            cur = cur[seg];
            continue;
        }

        // seg is string
        if (cur == null || typeof cur !== "object" || Array.isArray(cur)) {
            return;
        }

        if (isLast) {
            cur[seg] = value;
            return;
        }

        if (cur[seg] == null || typeof cur[seg] !== "object") {
            cur[seg] = typeof nextSeg === "number" ? [] : {};
        }

        cur = cur[seg];
    }
}

function deepFindFirstKey(root: any, key: string, maxNodes = 2500): any {
    // Breadth-first search for first occurrence of a key in nested objects/arrays.
    const q: any[] = [root];
    let visited = 0;
    while (q.length > 0 && visited < maxNodes) {
        const node = q.shift();
        visited += 1;
        if (node == null) continue;
        if (Array.isArray(node)) {
            for (const it of node) q.push(it);
            continue;
        }
        if (typeof node === "object") {
            if (Object.prototype.hasOwnProperty.call(node, key)) {
                return (node as any)[key];
            }
            for (const v of Object.values(node as any)) q.push(v);
        }
    }
    return undefined;
}

function buildPreviewSections(
    workflowSteps: WorkflowStep[],
    stepExecByStepId: Map<string, WorkflowExecutionStep>,
    outputConfig: string[] | null | undefined,
    workflowWcs: any,
    isExecutionRunning: boolean,
): PreviewSection[] {
    const keys = (outputConfig ?? []).filter((x) => typeof x === "string" && x.trim());
    const seenGlobal = new Set<string>();

    const sections: PreviewSection[] = [];

    for (const ws of workflowSteps) {
        const execStep = stepExecByStepId.get(ws.id);
        const status = execStep?.status ?? (isExecutionRunning ? "waiting" : "—");
        const outObj = toObject(execStep?.output);

        // preview_title_map priority:
        // 1) execution step input.config.preview_title_map
        // 2) workflow WCS per agent_id (design-time fallback)
        const stepInput = (execStep as any)?.input;
        const execPreviewTitleMap = resolvePreviewTitleMapFromStepInput(stepInput);
        const agentId = (execStep as any)?.agent_id ?? (ws as any)?.agent_id;
        const wcsPreviewTitleMap = agentId ? resolvePreviewTitleMapFromWcs((workflowWcs as any)?.[agentId]) : undefined;
        const previewTitleMap = execPreviewTitleMap ?? wcsPreviewTitleMap;

        // If we have no output yet, skip in terminal state; otherwise show placeholder while running.
        if (!outObj) {
            if (isExecutionRunning) {
                sections.push({
                    step_id: ws.id,
                    step_number: ws.step_number,
                    step_name: ws.name,
                    status,
                    preview_title_map: previewTitleMap,
                    selected_outputs: {},
                });
            }
            continue;
        }

        let selected: Record<string, any> = {};

        if (keys.length === 0) {
            // No output_config: show whole output per step (top-level keys), preserving step order.
            selected = outObj;
        } else {
            for (const keyOrPath of keys) {
                if (seenGlobal.has(keyOrPath)) continue;

                let value = getByPath(outObj, keyOrPath);
                const foundByExactPath = value !== undefined;

                // Fallback 1: if it's not a dotted path, do deep search by key.
                if (value === undefined && !keyOrPath.includes(".") && !keyOrPath.includes("[")) {
                    value = deepFindFirstKey(outObj, keyOrPath);
                }

                // Fallback 2: if it's a dotted path and doesn't exist, try the last segment as a deep key.
                if (value === undefined && (keyOrPath.includes(".") || keyOrPath.includes("["))) {
                    const lastSeg = keyOrPath
                        .replace(/\]/g, "")
                        .split(/[.[\[]/)
                        .filter(Boolean)
                        .pop();
                    if (lastSeg) {
                        value = deepFindFirstKey(outObj, lastSeg);
                    }
                }

                if (value === undefined) continue;

                // If the output_config uses dotted/bracket paths, reconstruct a nested
                // structure so the formatter + preview_title_map behave like Agent Output Stream.
                if (foundByExactPath && (keyOrPath.includes(".") || keyOrPath.includes("["))) {
                    if (selected == null || typeof selected !== "object" || Array.isArray(selected)) {
                        selected = {};
                    }
                    setByPath(selected, keyOrPath, value);
                } else {
                    selected[keyOrPath] = value;
                }
                seenGlobal.add(keyOrPath);
            }
        }

        // Include section even if selected is empty while running; otherwise skip empties.
        if (Object.keys(selected).length > 0 || isExecutionRunning) {
            sections.push({
                step_id: ws.id,
                step_number: ws.step_number,
                step_name: ws.name,
                status,
                preview_title_map: previewTitleMap,
                selected_outputs: selected,
            });
        }
    }

    return sections;
}

export function WorkflowsClient() {
    const { currentProject } = useProject();

    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<WorkflowWithLatestExecution[]>([]);
    const [search, setSearch] = useState("");

    const [statusFilter, setStatusFilter] = useState<
        "all" | "running" | "completed" | "failed" | "waiting_approval" | "stopped"
    >("all");
    const [lastRunSort, setLastRunSort] = useState<"desc" | "asc">("desc");
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const [sortMenuOpen, setSortMenuOpen] = useState(false);

    const [panelOpen, setPanelOpen] = useState(false);
    const [panelTab, setPanelTab] = useState<PanelTab>("preview");
    const [panelPreviewFontSize, setPanelPreviewFontSize] = useState<PreviewFontSize>("sm");
    const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
    const [selectedLatestExecution, setSelectedLatestExecution] = useState<WorkflowExecution | null>(null);
    const [selectedExecutionSteps, setSelectedExecutionSteps] = useState<WorkflowExecutionStep[]>([]);
    const [selectedWorkflowSteps, setSelectedWorkflowSteps] = useState<WorkflowStep[]>([]);
    const [agentPreviewTitleMapById, setAgentPreviewTitleMapById] = useState<Record<string, any>>({});

    const selectedWorkflowIdRef = useRef<string | null>(null);
    const pollInFlightRef = useRef(false);

    const statusMenuRef = useRef<HTMLDivElement | null>(null);
    const sortMenuRef = useRef<HTMLDivElement | null>(null);

    const [rowMenu, setRowMenu] = useState<
        | {
              workflowId: string;
              wf: Workflow;
              isRunning: boolean;
              top: number;
              left: number;
          }
        | null
    >(null);
    const rowMenuRef = useRef<HTMLDivElement | null>(null);
    const [duplicateBusyId, setDuplicateBusyId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            const data = await listWorkflowsWithLatestExecution();
            setItems(data ?? []);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    const refreshPanel = async (workflowId: string) => {
        selectedWorkflowIdRef.current = workflowId;

        try {
            const exec = await getWorkflowLatestExecution(workflowId);
            if (selectedWorkflowIdRef.current !== workflowId) return;
            setSelectedLatestExecution(exec);

            if (exec) {
                const [execSteps, wfSteps] = await Promise.all([
                    listExecutionSteps(exec.id).catch(() => []),
                    listWorkflowSteps(workflowId).catch(() => []),
                ]);
                if (selectedWorkflowIdRef.current !== workflowId) return;
                setSelectedExecutionSteps((execSteps ?? []).slice());

                const orderedWfSteps = (wfSteps ?? []).slice().sort((a, b) => a.step_number - b.step_number);
                setSelectedWorkflowSteps(orderedWfSteps);

                // Best-effort fallback: if workflow.wcs is missing a newly-added agent,
                // derive preview_title_map from the agent's prompt_system INPUT example.
                const uniqueAgentIds = Array.from(
                    new Set(
                        orderedWfSteps
                            .map((s) => s.agent_id)
                            .filter((x): x is string => typeof x === "string" && !!x),
                    ),
                );

                if (uniqueAgentIds.length > 0) {
                    Promise.all(
                        uniqueAgentIds.map(async (agentId) => {
                            try {
                                const agent = await getAgent(agentId);
                                const cfg = extractConfigFromPromptSystem(agent.prompt_system);
                                const ptm = coercePreviewTitleMap((cfg as any)?.preview_title_map);
                                return [agentId, ptm] as const;
                            } catch {
                                return [agentId, undefined] as const;
                            }
                        }),
                    ).then((pairs) => {
                        if (selectedWorkflowIdRef.current !== workflowId) return;
                        setAgentPreviewTitleMapById((prev) => {
                            const next = { ...prev };
                            for (const [agentId, ptm] of pairs) {
                                if (!ptm) continue;
                                next[agentId] = ptm;
                            }
                            return next;
                        });
                    });
                }
            } else {
                setSelectedExecutionSteps([]);
                setSelectedWorkflowSteps([]);
                setAgentPreviewTitleMapById({});
            }
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as Node | null;

            if (!(target && statusMenuRef.current && statusMenuRef.current.contains(target))) {
                setStatusMenuOpen(false);
            }
            if (!(target && sortMenuRef.current && sortMenuRef.current.contains(target))) {
                setSortMenuOpen(false);
            }

            // Close per-row context menu when clicking outside it.
            const el = target as HTMLElement | null;
            if (
                !(
                    target &&
                    ((rowMenuRef.current && rowMenuRef.current.contains(target)) ||
                        (el && el.closest("[data-wf-row-menu-trigger='true']")))
                )
            ) {
                setRowMenu(null);
            }
        };

        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, []);

    const handleDuplicateWorkflow = async (workflowId: string) => {
        if (duplicateBusyId) return;
        setRowMenu(null);
        setDuplicateBusyId(workflowId);

        try {
            const original = await getWorkflow(workflowId);
            const originalSteps = await listWorkflowSteps(workflowId).catch(() => []);

            const created = await createWorkflowForProject(original.project_id, {
                name: `${original.name} (duplicated)`,
                description: original.description ?? undefined,
            });

            // Copy WCS and output_config if present.
            if ((original as any)?.wcs) {
                await updateWorkflowWcs(created.id, (original as any).wcs);
            }
            if (Array.isArray((original as any)?.output_config)) {
                await updateWorkflowOutputConfig(created.id, (original as any).output_config);
            }

            // Copy steps, then fix next_step_id references.
            const ordered = (originalSteps ?? []).slice().sort((a, b) => a.step_number - b.step_number);
            const idMap = new Map<string, string>();

            for (const s of ordered) {
                const newStep = await createWorkflowStep(created.id, {
                    step_number: s.step_number,
                    name: s.name,
                    type: s.type,
                    agent_id: s.agent_id ?? null,
                    requires_approval: !!s.requires_approval,
                    config: s.config ?? null,
                    next_step_id: null,
                });
                idMap.set(s.id, newStep.id);
            }

            for (const s of ordered) {
                const newStepId = idMap.get(s.id);
                if (!newStepId) continue;
                if (!s.next_step_id) continue;
                const newNext = idMap.get(s.next_step_id);
                if (!newNext) continue;
                await updateWorkflowStep(created.id, newStepId, { next_step_id: newNext });
            }

            await refresh();
        } catch (e) {
            console.error(e);
            alert("Không thể duplicate workflow. Vui lòng thử lại.");
        } finally {
            setDuplicateBusyId(null);
        }
    };

    const confirmDeleteWorkflow = (wf: Workflow, isRunning?: boolean) => {
        if (isRunning) {
            setRowMenu(null);
            alert("Không thể xóa workflow khi đang chạy.");
            return;
        }
        setRowMenu(null);
        setDeleteTarget(wf);
    };

    const handleDeleteWorkflow = async () => {
        if (!deleteTarget) return;
        if (deleteBusy) return;

        const runningNow = (items ?? []).some(
            (it) => it.workflow?.id === deleteTarget.id && it.latest_execution?.status === "running",
        );
        if (runningNow) {
            alert("Không thể xóa workflow khi đang chạy.");
            setDeleteTarget(null);
            return;
        }

        setDeleteBusy(true);
        try {
            await deleteWorkflow(deleteTarget.id);

            // If the deleted workflow is open in the panel, close it.
            if (selectedWorkflow?.id === deleteTarget.id) {
                setPanelOpen(false);
                selectedWorkflowIdRef.current = null;
                setSelectedWorkflow(null);
                setSelectedLatestExecution(null);
                setSelectedExecutionSteps([]);
                setSelectedWorkflowSteps([]);
            }

            setDeleteTarget(null);
            await refresh();
        } catch (e) {
            console.error(e);
            alert("Không thể xóa workflow. Vui lòng thử lại.");
        } finally {
            setDeleteBusy(false);
        }
    };

    const scoped = useMemo(() => {
        const q = search.trim().toLowerCase();

        return items
            .filter((it) => {
                if (!currentProject?.id) return true;
                return it.workflow.project_id === currentProject.id;
            })
            .filter((it) => {
                if (!q) return true;
                const name = (it.workflow.name ?? "").toLowerCase();
                const desc = (it.workflow.description ?? "").toLowerCase();
                return name.includes(q) || desc.includes(q);
            });
    }, [items, search, currentProject?.id]);

    const filtered = useMemo(() => {
        const matchesStatus = (it: WorkflowWithLatestExecution) => {
            const s = it.latest_execution?.status;
            if (statusFilter === "all") return true;
            if (statusFilter === "stopped") return !s || s === "cancelled";
            return s === statusFilter;
        };

        const lastRunTs = (it: WorkflowWithLatestExecution): number | null => {
            const iso = it.latest_execution?.updated_at ?? it.latest_execution?.created_at;
            if (!iso) return null;
            const t = new Date(iso).getTime();
            return Number.isFinite(t) ? t : null;
        };

        return (scoped ?? [])
            .filter(matchesStatus)
            .slice()
            .sort((a, b) => {
                const ta = lastRunTs(a);
                const tb = lastRunTs(b);
                if (ta == null && tb == null) return (a.workflow.name ?? "").localeCompare(b.workflow.name ?? "");
                if (ta == null) return 1;
                if (tb == null) return -1;
                return lastRunSort === "desc" ? tb - ta : ta - tb;
            });
    }, [scoped, statusFilter, lastRunSort]);

    const filteredRunningCount = useMemo(() => {
        return (scoped ?? []).filter((it) => it.latest_execution?.status === "running").length;
    }, [scoped]);

    const shouldPoll = useMemo(() => {
        // Poll only when there is evidence something is still running.
        const anyRunning = (scoped ?? []).some((it) => it.latest_execution?.status === "running");
        const panelRunning = selectedLatestExecution?.status === "running";
        return anyRunning || panelRunning;
    }, [scoped, selectedLatestExecution?.status]);

    useEffect(() => {
        if (!shouldPoll) return;

        const interval = setInterval(() => {
            if (pollInFlightRef.current) return;
            pollInFlightRef.current = true;

            const tasks: Array<Promise<unknown>> = [];
            // Update list status badges without manual refresh
            tasks.push(refresh());

            // If preview panel is open AND its execution is running, keep it in sync too
            if (panelOpen && selectedWorkflow?.id && selectedLatestExecution?.status === "running") {
                tasks.push(refreshPanel(selectedWorkflow.id));
            }

            Promise.allSettled(tasks).finally(() => {
                pollInFlightRef.current = false;
            });
        }, 2500);

        return () => clearInterval(interval);
    }, [shouldPoll, panelOpen, selectedWorkflow?.id, selectedLatestExecution?.status]);

    const openPanel = async (wf: Workflow) => {
        setSelectedWorkflow(wf);
        setPanelTab("preview");
        setPanelPreviewFontSize("md");
        setPanelOpen(true);

        setSelectedLatestExecution(null);
        setSelectedExecutionSteps([]);
        setSelectedWorkflowSteps([]);

        await refreshPanel(wf.id);
    };

    const closePanel = () => {
        setPanelOpen(false);
        selectedWorkflowIdRef.current = null;
    };

    const handleStart = async (wf: Workflow) => {
        try {
            await runWorkflow(wf.id, { input: {} });
            await refresh();

            if (panelOpen && selectedWorkflow?.id === wf.id) {
                await openPanel(wf);
            }
        } catch (e) {
            console.error(e);
            alert("Không thể chạy workflow. Vui lòng kiểm tra cấu hình.");
        }
    };

    const handleStop = async (wf: Workflow, latest: WorkflowExecution | null) => {
        if (!latest) return;
        try {
            await cancelExecution(latest.id);
            await refresh();

            if (panelOpen && selectedWorkflow?.id === wf.id) {
                await openPanel(wf);
            }
        } catch (e) {
            console.error(e);
            alert("Không thể dừng workflow hiện tại.");
        }
    };

    const stepExecByStepId = useMemo(() => {
        const map = new Map<string, WorkflowExecutionStep>();
        for (const es of selectedExecutionSteps) {
            if (es.step_id) map.set(es.step_id, es);
        }
        return map;
    }, [selectedExecutionSteps]);

    const selectedOutputObject = useMemo(() => {
        if (!selectedWorkflow) return null;
        if (!selectedLatestExecution) return null;

        // Merge persisted WCS with derived preview_title_map fallbacks (do not overwrite persisted).
        const persisted = (selectedWorkflow as any)?.wcs;
        const effectiveWcs: any =
            persisted && typeof persisted === "object" && !Array.isArray(persisted)
                ? { ...(persisted as any) }
                : {};
        for (const [agentId, ptm] of Object.entries(agentPreviewTitleMapById)) {
            if (!ptm) continue;
            const existing = effectiveWcs[agentId];
            const existingPtm =
                existing?.preview_title_map ?? existing?.config?.preview_title_map ?? undefined;
            if (!existingPtm) {
                effectiveWcs[agentId] = {
                    ...(existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {}),
                    preview_title_map: ptm,
                };
            }
        }

        const sections = buildPreviewSections(
            selectedWorkflowSteps,
            stepExecByStepId,
            selectedWorkflow.output_config,
            effectiveWcs,
            selectedLatestExecution.status === "running",
        );
        return sections;
    }, [
        selectedWorkflow,
        selectedLatestExecution,
        selectedWorkflowSteps,
        stepExecByStepId,
        agentPreviewTitleMapById,
    ]);

    const selectedPreviewMarkdown = useMemo(() => {
        if (!selectedOutputObject) return "";
        const sections = selectedOutputObject as PreviewSection[];

        const parts: string[] = [];
        for (const sec of sections) {
            parts.push(`### ${sec.step_number}. ${sec.step_name}`);
            if (sec.status && sec.status !== "—") {
                parts.push(`_Status: ${sec.status}_`);
            }

            if (Object.keys(sec.selected_outputs).length === 0) {
                parts.push("(chưa có output hoặc đang chạy)");
            } else {
                parts.push(
                    formatAgentOutputToMarkdown(sec.selected_outputs, {
                        previewTitleMap: sec.preview_title_map,
                    }),
                );
            }

            parts.push("---");
        }

        // Remove trailing separator
        while (parts.length > 0 && parts[parts.length - 1] === "---") {
            parts.pop();
        }

        return parts.join("\n\n");
    }, [selectedOutputObject]);

    return (
        <>
            {rowMenu && typeof document !== "undefined" &&
                createPortal(
                    <div
                        ref={rowMenuRef}
                        className="fixed w-44 rounded-lg border border-border-dark bg-[#111218] shadow-lg z-[9999] overflow-hidden"
                        style={{ top: rowMenu.top, left: rowMenu.left }}
                    >
                        <button
                            type="button"
                            onClick={() => handleDuplicateWorkflow(rowMenu.workflowId)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-[#232530] hover:text-white transition-colors"
                        >
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                            <span>
                                {duplicateBusyId === rowMenu.workflowId ? "Đang duplicate..." : "Duplicate"}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => confirmDeleteWorkflow(rowMenu.wf, rowMenu.isRunning)}
                            disabled={rowMenu.isRunning}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                                rowMenu.isRunning
                                    ? "text-red-300/40 cursor-not-allowed"
                                    : "text-red-300 hover:bg-[#232530] hover:text-red-200"
                            }`}
                            title={rowMenu.isRunning ? "Không thể xóa khi workflow đang chạy" : ""}
                        >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                            <span>Delete</span>
                        </button>
                    </div>,
                    document.body,
                )}

            {deleteTarget && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => {
                            if (deleteBusy) return;
                            setDeleteTarget(null);
                        }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="w-full max-w-lg rounded-xl border border-border-dark bg-surface-dark shadow-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-border-dark flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-red-300">warning</span>
                                    <h3 className="text-sm font-semibold text-white">Xác nhận xóa workflow</h3>
                                </div>
                                <button
                                    type="button"
                                    className="text-text-secondary hover:text-white transition-colors"
                                    onClick={() => {
                                        if (deleteBusy) return;
                                        setDeleteTarget(null);
                                    }}
                                    title="Đóng"
                                >
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                            </div>

                            <div className="px-5 py-4">
                                <p className="text-sm text-text-secondary">
                                    Bạn có chắc chắn muốn xóa workflow <span className="text-white font-semibold">{deleteTarget.name}</span>?
                                </p>
                                <p className="mt-2 text-xs text-text-secondary">
                                    Đây là hành động không thể hoàn tác. Tất cả dữ liệu liên quan đến workflow (steps, executions, logs, cấu hình) sẽ bị xóa.
                                </p>
                            </div>

                            <div className="px-5 py-4 border-t border-border-dark flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="h-9 rounded-lg px-4 text-sm font-semibold bg-[#282b39] text-white hover:bg-[#3b3f54] transition-colors"
                                    onClick={() => {
                                        if (deleteBusy) return;
                                        setDeleteTarget(null);
                                    }}
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    className="h-9 rounded-lg px-4 text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    onClick={handleDeleteWorkflow}
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
                {/* Search */}
                <div className="w-full md:w-96">
                    <label className="flex w-full items-center rounded-lg border border-border-dark bg-[#111218] px-3 h-10 focus-within:border-primary transition-colors">
                        <span className="material-symbols-outlined text-text-secondary text-[20px]">search</span>
                        <input
                            className="w-full bg-transparent border-none text-white placeholder:text-text-secondary focus:ring-0 text-sm ml-2"
                            placeholder="Tìm kiếm workflow theo tên..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </label>
                </div>
                {/* Chips / Actions */}
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-2 text-text-secondary text-sm mr-2">
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        <span>Lọc:</span>
                    </div>
                    <div className="relative" ref={statusMenuRef}>
                        <button
                            type="button"
                            onClick={() => {
                                setStatusMenuOpen((v) => !v);
                                setSortMenuOpen(false);
                            }}
                            className="group flex h-8 items-center justify-center gap-x-2 rounded-lg bg-[#282b39] hover:bg-[#3b3f54] border border-transparent hover:border-border-dark pl-3 pr-2 transition-all"
                        >
                            <p className="text-white text-xs font-medium">
                                Trạng thái: {statusFilter === "all"
                                    ? "Tất cả"
                                    : statusFilter === "running"
                                        ? "Đang chạy"
                                        : statusFilter === "completed"
                                            ? "Hoàn thành"
                                            : statusFilter === "failed"
                                                ? "Lỗi"
                                                : statusFilter === "waiting_approval"
                                                    ? "Chờ duyệt"
                                                    : "Đã dừng"}
                            </p>
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
                                setStatusMenuOpen(false);
                            }}
                            className="group flex h-8 items-center justify-center gap-x-2 rounded-lg bg-[#282b39] hover:bg-[#3b3f54] border border-transparent hover:border-border-dark pl-3 pr-2 transition-all"
                        >
                            <p className="text-white text-xs font-medium">
                                Lần chạy cuối: {lastRunSort === "desc" ? "Mới nhất" : "Cũ nhất"}
                            </p>
                            <span className="material-symbols-outlined text-text-secondary text-[16px]">sort</span>
                        </button>
                        {sortMenuOpen && (
                            <div className="absolute left-0 mt-2 w-56 rounded-lg border border-border-dark bg-[#111218] shadow-lg z-50 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLastRunSort("desc");
                                        setSortMenuOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                                        lastRunSort === "desc"
                                            ? "bg-[#232530] text-white"
                                            : "text-text-secondary hover:bg-[#232530] hover:text-white"
                                    }`}
                                >
                                    Mới nhất
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLastRunSort("asc");
                                        setSortMenuOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                                        lastRunSort === "asc"
                                            ? "bg-[#232530] text-white"
                                            : "text-text-secondary hover:bg-[#232530] hover:text-white"
                                    }`}
                                >
                                    Cũ nhất
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="w-px h-6 bg-border-dark mx-1" />
                    <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-lg bg-[#282b39] hover:bg-primary text-text-secondary hover:text-white transition-colors"
                        title="Grid view (not implemented)"
                    >
                        <span className="material-symbols-outlined text-[20px]">grid_view</span>
                    </button>
                    <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-lg bg-primary text-white shadow-md"
                        title="List view"
                    >
                        <span className="material-symbols-outlined text-[20px]">list</span>
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <div className="flex flex-col overflow-hidden rounded-xl border border-border-dark bg-surface-dark shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#111218] border-b border-border-dark">
                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[25%]">Tên Workflow</th>
                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[30%]">Mô tả ngắn</th>
                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[15%]">Trạng thái</th>
                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[15%]">Lần chạy cuối</th>
                                <th className="p-4 text-xs font-semibold text-text-secondary uppercase tracking-wider w-[15%] text-right">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dark">
                            {filtered.length === 0 && !loading && (
                                <tr>
                                    <td className="p-4 text-sm text-text-secondary" colSpan={5}>
                                        Chưa có workflow nào. Bạn có thể bắt đầu bằng cách tạo workflow mới.
                                    </td>
                                </tr>
                            )}
                            {filtered.map((it) => {
                                const wf = it.workflow;
                                const latest = it.latest_execution;
                                const badge = getExecutionStatusBadge(latest);
                                const isRunning = latest?.status === "running";

                                return (
                                    <tr key={wf.id} className="group hover:bg-[#232530] transition-colors">
                                        <td className="p-4 align-top">
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center justify-center size-10 rounded-lg bg-purple-500/10 text-purple-400">
                                                    <span className="material-symbols-outlined">schema</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => openPanel(wf)}
                                                        className="text-white text-sm font-semibold hover:text-primary transition-colors truncate text-left"
                                                        title="Open preview"
                                                    >
                                                        {wf.name}
                                                    </button>
                                                    <p className="text-xs text-text-secondary">ID: {wf.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 align-top text-sm text-text-secondary">{wf.description ?? "—"}</td>
                                        <td className="p-4 align-top">
                                            <span className={badge.className}>
                                                {latest?.status === "running" ? (
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                                                    </span>
                                                ) : latest?.status === "completed" ? (
                                                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                ) : latest?.status === "failed" ? (
                                                    <span className="material-symbols-outlined text-[14px]">error</span>
                                                ) : null}
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td className="p-4 align-top text-text-secondary text-sm">
                                            {formatRelativeTime(latest?.updated_at ?? latest?.created_at)}
                                        </td>
                                        <td className="p-4 align-top text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {isRunning ? (
                                                    <button
                                                        type="button"
                                                        className="size-8 flex items-center justify-center rounded-md hover:bg-[#282b39] text-red-400 hover:text-red-300 transition-colors"
                                                        title="Dừng"
                                                        onClick={() => handleStop(wf, latest)}
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">stop_circle</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="size-8 flex items-center justify-center rounded-md hover:bg-[#282b39] text-green-400 hover:text-green-300 transition-colors"
                                                        title="Chạy"
                                                        onClick={() => handleStart(wf)}
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">play_circle</span>
                                                    </button>
                                                )}

                                                <Link
                                                    href={latest ? `/executions/${latest.id}` : "#"}
                                                    className={`size-8 flex items-center justify-center rounded-md hover:bg-[#282b39] transition-colors ${latest
                                                            ? "text-text-secondary hover:text-white"
                                                            : "text-text-secondary/40 pointer-events-none"
                                                        }`}
                                                    title="View Logs"
                                                >
                                                    <span className="material-symbols-outlined text-[20px]">terminal</span>
                                                </Link>

                                                <Link
                                                    href={`/workflows/${wf.id}/design`}
                                                    className="size-8 flex items-center justify-center rounded-md hover:bg-[#282b39] text-text-secondary hover:text-white transition-colors"
                                                    title="Chỉnh sửa"
                                                >
                                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                                </Link>

                                                <button
                                                    type="button"
                                                    className="size-8 flex items-center justify-center rounded-md hover:bg-[#282b39] text-text-secondary hover:text-white transition-colors"
                                                    title="More"
                                                    data-wf-row-menu-trigger="true"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                        const menuWidth = 176;
                                                        const pad = 8;
                                                        let left = rect.right - menuWidth;
                                                        left = Math.max(pad, Math.min(left, window.innerWidth - menuWidth - pad));
                                                        let top = rect.bottom + 8;
                                                        top = Math.max(pad, Math.min(top, window.innerHeight - 140));

                                                        setRowMenu((prev) =>
                                                            prev?.workflowId === wf.id
                                                                ? null
                                                                : {
                                                                    workflowId: wf.id,
                                                                    wf,
                                                                    isRunning,
                                                                    top,
                                                                    left,
                                                                },
                                                        );
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined text-[20px]">more_vert</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {filteredRunningCount > 0 && (
                                <tr>
                                    <td className="p-4 text-sm text-text-secondary" colSpan={5}>
                                        <span className="inline-flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                                            <span>
                                                {filteredRunningCount}/{scoped.length} workflow đang chạy...
                                            </span>
                                        </span>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Right Sidebar Preview */}
            {panelOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20" onClick={closePanel} />}
            <div
                className={`fixed inset-y-0 right-0 w-1/2 min-w-[520px] bg-surface-dark border-l border-border-dark shadow-2xl z-30 transform transition-transform duration-300 ease-out grid grid-rows-[auto,1fr] ${panelOpen ? "translate-x-0" : "translate-x-full"
                    }`}
            >
                <div className="px-6 py-5 border-b border-border-dark flex items-center justify-between">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-white truncate">
                            {selectedWorkflow?.name
                                ? `Workflow Output Stream - ${selectedWorkflow.name}`
                                : "Workflow Output Stream"}
                        </h2>
                        <div className="mt-1">
                            <span className={getExecutionStatusBadge(selectedLatestExecution).className}>
                                {getExecutionStatusBadge(selectedLatestExecution).label}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="text-text-secondary hover:text-white transition-colors p-1"
                        title="Đóng"
                        onClick={closePanel}
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="min-h-0 overflow-hidden p-6 flex flex-col gap-4">
                    {selectedWorkflow && selectedLatestExecution && (
                        <div className="shrink-0 rounded-xl border border-border-dark bg-[#111218] p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-white">Steps</p>
                                <p className="text-[11px] text-text-secondary">
                                    Execution: {selectedLatestExecution.id}
                                </p>
                            </div>
                            <div className="mt-3 space-y-2">
                                {selectedWorkflowSteps.length === 0 && (
                                    <p className="text-[11px] text-text-secondary">Không có steps.</p>
                                )}
                                {selectedWorkflowSteps.map((ws) => {
                                    const execStep = stepExecByStepId.get(ws.id);
                                    const normalized = normalizeStepStatus(execStep?.status);
                                    const dotClass =
                                        normalized === "done"
                                            ? "bg-emerald-400"
                                            : normalized === "running"
                                                ? "bg-blue-400"
                                                : normalized === "error"
                                                    ? "bg-red-400"
                                                    : "bg-slate-500";

                                    return (
                                        <div key={ws.id} className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                                                <span className="text-xs text-white truncate">
                                                    {ws.step_number}. {ws.name}
                                                </span>
                                            </div>
                                            <span className="text-[10px] uppercase tracking-wide text-text-secondary">
                                                {execStep?.status ?? (selectedLatestExecution.status === "running" ? "waiting" : "—")}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="flex-1 min-h-0 rounded-xl border border-border-dark bg-[#111218] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between border-b border-border-dark bg-surface-darker px-4 py-3">
                            <div className="flex bg-[#282b39] rounded-lg p-1">
                                <button
                                    type="button"
                                    onClick={() => setPanelTab("preview")}
                                    className={`px-3 py-1 text-xs font-bold rounded ${
                                        panelTab === "preview"
                                            ? "bg-primary text-white shadow-sm"
                                            : "text-[#9da1b9] hover:text-white"
                                    }`}
                                >
                                    Preview
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPanelTab("json")}
                                    className={`px-3 py-1 text-xs font-medium rounded ${
                                        panelTab === "json" ? "bg-primary text-white shadow-sm" : "text-[#9da1b9] hover:text-white"
                                    }`}
                                >
                                    Raw JSON
                                </button>
                            </div>

                            <div className="flex bg-[#282b39] rounded-lg p-1">
                                <button
                                    type="button"
                                    onClick={() => setPanelPreviewFontSize("lg")}
                                    className={`px-2.5 py-1 rounded transition-colors ${
                                        panelPreviewFontSize === "lg"
                                            ? "bg-primary text-white shadow-sm"
                                            : "text-[#9da1b9] hover:text-white"
                                    }`}
                                >
                                    <span className="text-sm font-semibold">Large</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPanelPreviewFontSize("md")}
                                    className={`px-2.5 py-1 rounded transition-colors ${
                                        panelPreviewFontSize === "md"
                                            ? "bg-primary text-white shadow-sm"
                                            : "text-[#9da1b9] hover:text-white"
                                    }`}
                                >
                                    <span className="text-xs font-semibold">Medium</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPanelPreviewFontSize("sm")}
                                    className={`px-2.5 py-1 rounded transition-colors ${
                                        panelPreviewFontSize === "sm"
                                            ? "bg-primary text-white shadow-sm"
                                            : "text-[#9da1b9] hover:text-white"
                                    }`}
                                >
                                    <span className="text-[11px] font-semibold">Small</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto p-4">
                            {panelTab === "preview" ? (
                                !selectedLatestExecution ? (
                                    <p className="text-sm text-text-secondary">Workflow chưa có execution nào.</p>
                                ) : (
                                    <MarkdownPreview
                                        markdown={selectedPreviewMarkdown || "(chưa có output hoặc đang chạy)"}
                                        fontSize={panelPreviewFontSize}
                                    />
                                )
                            ) : (
                                <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words">
                                    {selectedLatestExecution && selectedWorkflow
                                        ? JSON.stringify(
                                            {
                                                workflow: {
                                                    id: selectedWorkflow.id,
                                                    name: selectedWorkflow.name,
                                                    output_config: (selectedWorkflow as any)?.output_config ?? null,
                                                },
                                                preview_sections: selectedOutputObject,
                                            },
                                            null,
                                            2,
                                        )
                                        : "(no execution)"}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
