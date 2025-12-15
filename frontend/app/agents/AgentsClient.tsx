"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    Agent,
    AgentCreatePayload,
    AgentUpdatePayload,
    LLMProviderInfo,
    createAgent,
    updateAgent,
    deleteAgent,
    getAgent,
    listLLMProviders,
} from "@/lib/api";

type Mode = "create" | "edit";

interface AgentsClientProps {
        initialAgents: Agent[];
}

type AgentTemplateId =
        | "topic-gap-finder-v3"
        | "topic-selector-v1"
        | "insight-extractor-v3"
        | "longform-generator-v3"
        | "repurpose-machine-v3"
        | "audience-analyst-v3"
        | "monetization-architect-v3";

type AgentTemplate = {
        name: string;
        description: string;
        systemPrompt: string;
        userPrompt: string;
        inputSchema?: any;
        outputSchema?: any;
};

const AGENT_TEMPLATES: Record<AgentTemplateId, AgentTemplate> = {
        "topic-gap-finder-v3": {
                name: "Topic Gap Finder Agent — V3",
                description:
                        "Phân tích thị trường nội dung Việt Nam để tìm content gap và tạo topic_gaps + content_seeds + research_snippets.",
                systemPrompt: `Bạn là **Topic Gap Finder Agent**, nhiệm vụ của bạn là phân tích thị trường nội dung Việt Nam và tìm ra **content gap thực sự** — chủ đề có **nhu cầu cao** nhưng **nội dung hiện tại yếu, sai hoặc hời hợt**.

Bạn đồng thời phải thu thập **research_snippets** (snapshot tri thức) từ sách, bài báo, nghiên cứu, trang web… để cung cấp nguyên liệu cho Insight Extractor.

### Định nghĩa mở rộng
- **Nhu cầu cao** = search volume tốt, được bàn luận nhiều nhưng không có giải pháp rõ ràng.
- **Nội dung yếu** = trùng lặp, không có framework, không giải quyết vấn đề thực tế.
- **Chưa được khai thác đúng** = góc nhìn cũ, sai insight, không phù hợp audience.

### RULES
- Không được trả về chủ đề chung chung.
- Mỗi topic phải là **1 vấn đề rất cụ thể**.
- Phải tạo **ít nhất 2 research_snippets** (nếu có thể).
- Không viết lan man, không giải thích.
- Output **chỉ** là JSON.

### INPUT
{
    "field": "",
    "audience": "",
    "style": "",
    "goal": ""
}

### OUTPUT (UPDATED SCHEMA)
{
    "topic_gaps": [
        {
            "topic_id": "",            
            "topic": "",
            "demand": "low|medium|high",
            "why_gap_exists": "",
            "content_gap": "",
            "unique_angles": ["", "", ""],
            "risks": "",
            "research_snippets": [
                {
                    "source_type": "book|article|paper|web|video",
                    "source_title": "",
                    "source_author": "",
                    "source_url": "",
                    "snippet_text": "",
                    "snippet_highlights": ["", ""]
                }
            ]
        }
    ],
    "content_seeds": ["", "", ""]
}`,
                userPrompt:
                        "Đây là input JSON cho nhiệm vụ: {{input_json}}\nHãy trả về đúng JSON theo schema.",
                outputSchema: {
                        topic_gaps: [],
                        content_seeds: [],
                },
        },
        "topic-selector-v1": {
                name: "Topic Selector Agent — V1",
                description:
                        "Chấm điểm và chọn 1 topic tốt nhất từ topic_gaps để chuyển sang Insight Extractor.",
                systemPrompt: `Bạn là Topic Selector Agent, nhiệm vụ của bạn:
- Nhận danh sách topic_gaps từ Topic Finder.
- Phân tích từng topic theo các tiêu chí: demand, uniqueness, monetization potential, data richness.
- Chấm điểm và chọn ra 1 topic tốt nhất để chuyển sang Insight Extractor.
- Hỗ trợ full-auto mode (tự chọn) hoặc manual mode (user chọn → bạn trả về JSON hợp lệ).

### Tiêu chí chấm điểm
- Demand Score (0–10): nhu cầu thị trường.
- Uniqueness Score (0–10): độ mới lạ / góc nhìn khác biệt.
- Feasibility Score (0–10): có đủ snippet để tạo insight hay không.
- Monetization Score (0–10): khả năng tạo sản phẩm (PDF/video series).

### RULES
- Không viết thêm văn bản ngoài JSON.
- Nếu user chọn manual → agent chỉ xác nhận lại và output đúng schema.
- Nếu auto mode → agent tự tính điểm và chọn topic phù hợp nhất.

### INPUT
{
    "mode": "auto|manual",
    "topic_gaps": [ ... ],
    "user_choice": "topic_id or null"
}

### OUTPUT
{
    "selected_topic": {
        "topic_id": "",
        "topic": "",
        "reason": "",
        "scores": {
            "demand": 0,
            "uniqueness": 0,
            "feasibility": 0,
            "monetization": 0
        }
    }
}`,
                userPrompt:
                        "Đây là input JSON: {{input_json}}\nHãy trả về đúng JSON theo schema.",
                outputSchema: {
                        selected_topic: {},
                },
        },
        "insight-extractor-v3": {
                name: "Insight Extractor Agent — V3",
                description:
                        "Chuyển research_snippets + raw_notes thành bộ insights dạng What–Why–How–Example.",
                systemPrompt: `Bạn là **Insight Extractor Agent**, nhiệm vụ của bạn:
- chuyển *research_snippets* + *raw_notes* thành **insight dạng What–Why–How–Example**.
- Insight phải có tính thực hành, không tóm tắt.

### RULES
- Không được viết chung chung.
- Không được tóm tắt lại snippets.
- Phải tổng hợp insight từ nhiều nguồn.
- Example phải rõ ràng, có nguồn (source_title).

### INPUT (UPDATED)
{
    "topic_id": "",
    "topic": "",
    "research_snippets": [
        {
            "source_type": "",
            "source_title": "",
            "source_author": "",
            "source_url": "",
            "snippet_text": "",
            "snippet_highlights": ["", ""]
        }
    ],
    "raw_notes": "",
    "highlights": []
}

### OUTPUT SCHEMA
{
    "topic_id": "",
    "insights": [
        {
            "what": "",
            "why": "",
            "how": "",
            "example": ""
        }
    ],
    "metadata": {
        "used_sources": ["", ""]
    }
}`,
                userPrompt:
                        "Dưới đây là JSON input: {{input_json}}\nHãy trả về đúng JSON theo schema.",
                outputSchema: {
                        topic_id: "",
                        insights: [],
                        metadata: {},
                },
        },
        "longform-generator-v3": {
                name: "Long‑Form Content Generator — V3",
                description:
                        "Tạo bài long-form 700–1200 từ dựa 100% trên insights.",
                systemPrompt: `Bạn là **Long‑Form Content Generator Agent**, nhiệm vụ:
- Viết bài long-form **700–1200 từ**, dựa 100% trên insights.
- Không được tạo fact sai hoặc vượt ngoài insight.

### RULES
- Cấu trúc: Hook → Problem → Insight Analysis → Framework → Case Study → Checklist → CTA.
- Văn phong: thuyết phục – logic – có tính sư phạm.

### INPUT
{
    "topic_id": "",
    "topic": "",
    "audience": "",
    "insights": [ ... ],
    "style": ""
}

### OUTPUT
{
    "topic_id": "",
    "long_form": "Nội dung bài long-form"
}`,
                userPrompt:
                        "Đây là input JSON: {{input_json}}\nHãy tạo long_form và trả về đúng schema.",
                outputSchema: {
                        topic_id: "",
                        long_form: "",
                },
        },
        "repurpose-machine-v3": {
                name: "Repurpose Machine Agent — V3",
                description:
                        "Chuyển long_form thành 5–10 video scripts ngắn cho TikTok/Reels/Shorts.",
                systemPrompt: `Bạn là **Repurpose Machine Agent**, nhiệm vụ:
- Chuyển long_form thành **5–10 video scripts** (mỗi script ≤ 85 từ).
- Format video: Hook → 3 bullets → CTA.

### RULES
- Không được copy-paste nguyên xi từ long_form.
- Mỗi script phải đứng độc lập.
- Hook phải mạnh và rõ.

### INPUT
{
    "topic_id": "",
    "long_form": "",
    "style": "",
    "platforms": ["tiktok", "reels", "shorts"]
}

### OUTPUT
{
    "topic_id": "",
    "videos": [
        {
            "platform": "",
            "script": ""
        }
    ]
}`,
                userPrompt: "Input JSON: {{input_json}}\nHãy trả về đúng JSON theo schema.",
                outputSchema: {
                        topic_id: "",
                        videos: [],
                },
        },
        "audience-analyst-v3": {
                name: "Audience Analyst Agent — V3",
                description:
                        "Phân tích metrics + comments để tạo audience_insights và đề xuất new_topics.",
                systemPrompt: `Bạn là **Audience Analyst Agent**, nhiệm vụ:
- Phân tích hiệu suất nội dung (metrics + comments).
- Tìm ra insight hành vi người xem.
- Gợi ý topic mới để loop quay lại Topic Finder.

### INPUT
{
    "topic_id": "",
    "metrics": {},
    "comments": [],
    "content_type": ""
}

### OUTPUT
{
    "topic_id": "",
    "audience_insights": ["", ""],
    "new_topics": ["", ""]
}`,
                userPrompt: "Input JSON: {{input_json}}\nHãy trả về đúng schema.",
                outputSchema: {
                        topic_id: "",
                        audience_insights: [],
                        new_topics: [],
                },
        },
        "monetization-architect-v3": {
                name: "Monetization Architect Agent — V3",
                description:
                        "Thiết kế value ladder, đề xuất sản phẩm PDF và CTA dựa trên nội dung + audience.",
                systemPrompt: `Bạn là **Monetization Architect Agent**, nhiệm vụ:
- Dựa trên nội dung + audience + insights để tạo mô hình doanh thu.
- Tạo value ladder + đề xuất PDF product.
- Gợi ý CTA phù hợp với short videos.

### INPUT
{
    "topic_id": "",
    "audience": "",
    "content_assets": [],
    "goals": "",
    "existing_products": []
}

### OUTPUT
{
    "topic_id": "",
    "value_ladder": [
        {
            "product_name": "",
            "price": 0,
            "why_it_works": ""
        }
    ],
    "cta_recommendations": ["", ""]
}`,
                userPrompt: "Input JSON: {{input_json}}\nHãy trả về đúng JSON theo schema.",
                outputSchema: {
                        topic_id: "",
                        value_ladder: [],
                        cta_recommendations: [],
                },
        },
};

export function AgentsClient({ initialAgents }: AgentsClientProps) {
    const [agents, setAgents] = useState<Agent[]>(initialAgents ?? []);
    const [panelOpen, setPanelOpen] = useState(false);
    const [mode, setMode] = useState<Mode>("create");
    const [selectedId, setSelectedId] = useState<string | null>(null);
	const [currentTemplateId, setCurrentTemplateId] = useState<AgentTemplateId | null>(null);

    const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
    const [providerId, setProviderId] = useState<string>("openai");

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [model, setModel] = useState("gpt-4.1-mini");
    const [temperature, setTemperature] = useState<number>(0.7);
    const [systemPrompt, setSystemPrompt] = useState(
        "You are an expert SEO content writer specialized in technology.\n" +
        "Your goal is to write engaging, informative, and search-engine-optimized blog posts.\n" +
        "Always use H2 and H3 for structure.\n" +
        "Maintain a professional yet accessible tone."
    );
    const [userPrompt, setUserPrompt] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

        function applyTemplate(templateId: AgentTemplateId) {
        const template = AGENT_TEMPLATES[templateId];
        if (!template) return;

        setMode("create");
        setSelectedId(null);
        setPanelOpen(true);
        setError(null);
		setCurrentTemplateId(templateId);

        setName(template.name);
        setDescription(template.description);
        setSystemPrompt(template.systemPrompt);
        setUserPrompt(template.userPrompt);
    }

    const selectedAgent = useMemo(
        () => agents.find((a) => a.id === selectedId) ?? null,
        [agents, selectedId]
    );

    useEffect(() => {
        listLLMProviders()
            .then((items) => {
                setProviders(items);
                const enabled = items.find((p) => p.enabled) ?? items[0];
                if (enabled) {
                    setProviderId(enabled.id);
                    if (enabled.models && enabled.models.length > 0) {
                        setModel(enabled.models[0].id);
                    }
                }
            })
            .catch(() => {
                // keep defaults if backend not reachable
            });
    }, []);

    function resetForm() {
        setName("");
        setDescription("");
        setCurrentTemplateId(null);

        const enabled = providers.find((p) => p.enabled) ?? providers[0];
        if (enabled) {
            setProviderId(enabled.id);
            if (enabled.models && enabled.models.length > 0) {
                setModel(enabled.models[0].id);
            }
        }

        setTemperature(0.7);
        setSystemPrompt(
            "You are an expert SEO content writer specialized in technology.\n" +
            "Your goal is to write engaging, informative, and search-engine-optimized blog posts.\n" +
            "Always use H2 and H3 for structure.\n" +
            "Maintain a professional yet accessible tone."
        );
        setUserPrompt("");
        setError(null);
    }

    function openCreatePanel() {
        setMode("create");
        setSelectedId(null);
        resetForm();
        setPanelOpen(true);
    }

    async function openEditPanel(agentId: string) {
        setMode("edit");
        setSelectedId(agentId);
        setPanelOpen(true);
        setError(null);
		setCurrentTemplateId(null);

        try {
            setLoading(true);
            const full = await getAgent(agentId);
            setName(full.name ?? "");
            setDescription(full.description ?? "");
            setModel(full.model ?? model);
            setTemperature(typeof full.temperature === "number" ? full.temperature : 0.7);
            setSystemPrompt(full.prompt_system ?? "");
            setUserPrompt(full.prompt_template ?? "");

            const match = providers.find((p) =>
                p.models.some((m) => m.id === full.model)
            );
            if (match) {
                setProviderId(match.id);
            }
        } catch (err: any) {
            setError(err?.message ?? "Không thể tải Agent");
        } finally {
            setLoading(false);
        }
    }

    function closePanel() {
        setPanelOpen(false);
    }

    async function handleDelete() {
        if (!selectedId) return;
        try {
            setLoading(true);
            setError(null);
            await deleteAgent(selectedId);
            setAgents((prev) => prev.filter((a) => a.id !== selectedId));
            setSelectedId(null);
            setPanelOpen(false);
        } catch (err: any) {
            setError(err?.message ?? "Không thể xóa Agent");
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!name.trim()) return;

        const payload: AgentCreatePayload = {
            name: name.trim(),
            description: description.trim() || undefined,
            model,
            prompt_system: systemPrompt.trim() || undefined,
            prompt_template: userPrompt.trim() || undefined,
            temperature,
        };

		// Nếu đang tạo mới từ một template đã biết, tự động gắn schema
		if (mode === "create" && currentTemplateId) {
			const tpl = AGENT_TEMPLATES[currentTemplateId];
			if (tpl.inputSchema) {
				payload.input_schema = tpl.inputSchema;
			}
			if (tpl.outputSchema) {
				payload.output_schema = tpl.outputSchema;
			}
		}

        try {
            setLoading(true);
            setError(null);

            if (mode === "create") {
                const created = await createAgent(payload);
                setAgents((prev) => [...prev, created]);
                setPanelOpen(false);
            } else if (mode === "edit" && selectedId) {
                const updated = await updateAgent(selectedId, payload);
                setAgents((prev) =>
                    prev.map((a) => (a.id === updated.id ? updated : a))
                );
                setPanelOpen(false);
            }
        } catch (err: any) {
            setError(err?.message ?? "Không thể lưu Agent");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Header + subheader + divider, aligned with Projects/Workflows */}
            <div className="flex flex-wrap justify-between items-end gap-4 border-b border-border-dark pb-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-white text-3xl font-black leading-tight tracking-[-0.033em]">
                        Quản lý Agent
                    </h1>
                    <p className="text-text-secondary text-base">
                        Tạo và cấu hình các trợ lý AI chuyên biệt cho quy trình của bạn.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-surface-dark border border-border-dark text-white hover:bg-border-dark transition-colors text-sm font-medium"
                        onClick={async () => {
                            try {
                                setLoading(true);
                                setError(null);

                                const createdAgents: Agent[] = [];
                                const updatedAgents: Agent[] = [];
                                for (const templateId of [
                                    "topic-gap-finder-v3",
                                    "topic-selector-v1",
                                    "insight-extractor-v3",
                                    "longform-generator-v3",
                                    "repurpose-machine-v3",
                                    "audience-analyst-v3",
                                    "monetization-architect-v3",
                                ] as AgentTemplateId[]) {
                                    const template = AGENT_TEMPLATES[templateId];
                                    if (!template) continue;

                                    const existing = agents.find(
                                        (a) => a.name.toLowerCase() === template.name.toLowerCase(),
                                    );

								const inputSchema = template.inputSchema;
								const outputSchema = template.outputSchema;

                                    if (existing) {
                                        const hasOutputSchemaKeys =
                                            existing.output_schema &&
                                            typeof existing.output_schema === "object" &&
                                            !Array.isArray(existing.output_schema) &&
                                            Object.keys(existing.output_schema as Record<string, unknown>).length > 0;

                                        const needsUpdate = !!outputSchema && !hasOutputSchemaKeys;

                                        if (needsUpdate) {
                                            const updatePayload: AgentUpdatePayload = {};
                                            if (inputSchema) {
                                                updatePayload.input_schema = inputSchema;
                                            }
                                            if (outputSchema) {
                                                updatePayload.output_schema = outputSchema;
                                            }

                                            if (Object.keys(updatePayload).length > 0) {
                                                const updated = await updateAgent(existing.id, updatePayload);
                                                updatedAgents.push(updated);
                                            }
                                        }
                                    } else {
                                        const payload: AgentCreatePayload = {
                                            name: template.name,
                                            description: template.description,
                                            model,
                                            prompt_system: template.systemPrompt,
                                            prompt_template: template.userPrompt,
                                            temperature,
                                        };

                                        if (inputSchema) {
                                            payload.input_schema = inputSchema;
                                        }
                                        if (outputSchema) {
                                            payload.output_schema = outputSchema;
                                        }

                                        const created = await createAgent(payload);
                                        createdAgents.push(created);
                                    }
                                }

                                if (createdAgents.length > 0 || updatedAgents.length > 0) {
                                    setAgents((prev) => {
                                        let next = [...prev];

                                        for (const updated of updatedAgents) {
                                            const idx = next.findIndex((a) => a.id === updated.id);
                                            if (idx >= 0) {
                                                next[idx] = updated;
                                            } else {
                                                next.push(updated);
                                            }
                                        }

                                        return [...next, ...createdAgents];
                                    });
                                }
                            } catch (err: any) {
                                setError(err?.message ?? "Không thể thêm bộ Agents V3");
                            } finally {
                                setLoading(false);
                            }
                        }}
                    >
                        <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                        <span>Thêm bộ Agents V3</span>
                    </button>
                    <button
                        type="button"
                        onClick={openCreatePanel}
                        className="flex items-center justify-center gap-2 rounded-lg h-10 px-5 bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-900/20 transition-all text-sm font-bold tracking-wide"
                    >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        <span>Thêm Agent mới</span>
                    </button>
                </div>
            </div>

            {/* Main content: toolbar + table */}
            <div className="flex flex-col gap-4">
                {/* Toolbar */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-surface-dark p-4 rounded-xl border border-border-dark">
                    {/* Search */}
                    <div className="w-full md:w-96">
                    <label className="flex w-full items-center rounded-lg border border-border-dark bg-[#111218] px-3 h-10 focus-within:border-primary transition-colors">
                        <span className="material-symbols-outlined text-text-secondary text-[20px]">
                        search
                        </span>
                        <input
                        className="w-full bg-transparent border-none text-white placeholder:text-text-secondary focus:ring-0 text-sm ml-2"
                        placeholder="Tìm kiếm workflow theo tên..."
                        />
                    </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className="p-2 text-text-secondary hover:text-white rounded-lg hover:bg-surface-dark transition-colors"
                            title="Filter"
                        >
                            <span className="material-symbols-outlined">filter_list</span>
                        </button>
                        <button
                            className="p-2 text-text-secondary hover:text-white rounded-lg hover:bg-surface-dark transition-colors"
                            title="Sort"
                        >
                            <span className="material-symbols-outlined">sort</span>
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="rounded-xl border border-border-dark bg-surface-dark overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#15161e] border-b border-border-dark">
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                                    Tên Agent
                                </th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                                    Mô hình LLM
                                </th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                                    Trạng thái
                                </th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-secondary text-right">
                                    Cập nhật
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dark">
                            {agents.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={4}
                                        className="px-6 py-6 text-sm text-text-secondary text-center"
                                    >
                                        Chưa có agent nào. Hãy tạo agent đầu tiên.
                                    </td>
                                </tr>
                            )}
                            {agents.map((agent) => {
                                const isSelected = agent.id === selectedId && panelOpen;
                                return (
                                    <tr
                                        key={agent.id}
                                        className={`group hover:bg-white/5 transition-colors cursor-pointer ${isSelected ? "bg-primary/5" : ""
                                            }`}
                                        onClick={() => openEditPanel(agent.id)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="size-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                                    <span className="material-symbols-outlined">smart_toy</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-white text-sm font-medium">{agent.name}</span>
                                                    {agent.description && (
                                                        <span className="text-text-secondary text-xs truncate max-w-[180px]">
                                                            {agent.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-border-dark text-white border border-white/10">
                                                {agent.model || "GPT-4 Turbo"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="relative flex h-2.5 w-2.5">
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                                                </span>
                                                <span className="text-emerald-500 text-sm font-medium">
                                                    {agent.is_active ? "Active" : "Inactive"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-text-secondary text-xs">
                                                {agent.updated_at
                                                    ? new Date(agent.updated_at).toLocaleString()
                                                    : ""}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Right: Details/Edit Panel (fixed overlay on right edge) */}
            {panelOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20"
                    onClick={closePanel}
                />
            )}
            <div
                className={`fixed inset-y-0 right-0 w-full md:w-1/2 bg-surface-dark border-l border-border-dark shadow-2xl z-30 transform transition-transform duration-300 ease-out grid grid-rows-[auto,1fr,auto] ${panelOpen ? "translate-x-0" : "translate-x-full"
                    }`}
            >
                {/* Panel Header (row 1, fixed) */}
                <div className="px-6 py-5 border-b border-border-dark flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">
                        {mode === "create" ? "Thêm Agent mới" : "Cấu hình Agent"}
                    </h2>
                    <div className="flex gap-2">
                        {mode === "edit" && (
                            <button
                                type="button"
                                className="text-text-secondary hover:text-red-500 transition-colors p-1"
                                title="Xóa Agent"
                                onClick={handleDelete}
                                disabled={loading}
                            >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="text-text-secondary hover:text-white transition-colors p-1"
                            title="Đóng"
                            onClick={closePanel}
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>
                </div>

                {/* Panel Body + Footer (rows 2 and 3) */}
                <form onSubmit={handleSubmit} className="contents">
                    {/* Scrollable content area (row 2) */}
                    <div className="overflow-y-auto agent-scroll p-6 flex flex-col gap-6">
                        {/* Top row: Agent description | LLM config */}
                        <div className="grid grid-cols-2 gap-6">
                            <div className="flex flex-col gap-4">
                                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                                    Mô tả Agent
                                </h3>
                                <label className="flex flex-col gap-2">
                                    <span className="text-sm font-medium text-white">Tên Agent</span>
                                    <input
                                        className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:outline focus:outline-1 focus:outline-border-dark focus:outline-offset-0 focus:ring-0 placeholder-text-secondary"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        disabled={loading}
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-sm font-medium text-white">Mô tả ngắn</span>
                                    <textarea
                                        className="bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:outline focus:outline-1 focus:outline-border-dark focus:outline-offset-0 focus:ring-0 placeholder-text-secondary resize-none"
                                        rows={2}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        disabled={loading}
                                    />
                                </label>
                            </div>

                            <div className="flex flex-col gap-4">
                                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                                    Cấu hình LLM
                                </h3>
                                <label className="flex flex-col gap-2">
                                    <span className="text-sm font-medium text-white">Model Provider</span>
                                    <div className="relative">
                                        <select
                                            className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:outline focus:outline-1 focus:outline-border-dark focus:outline-offset-0 focus:ring-0 appearance-none"
                                            value={providerId}
                                            onChange={(e) => {
                                                const nextId = e.target.value;
                                                setProviderId(nextId);
                                                const provider = providers.find((p) => p.id === nextId);
                                                if (provider && provider.models.length > 0) {
                                                    setModel(provider.models[0].id);
                                                }
                                            }}
                                            disabled={loading}
                                        >
                                            {providers.map((p) => (
                                                <option key={p.id} value={p.id} disabled={!p.enabled}>
                                                    {p.name}
                                                    {!p.enabled ? " (chưa cấu hình API key)" : ""}
                                                </option>
                                            ))}
                                        </select>
                                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none text-[20px]">
                                            expand_more
                                        </span>
                                    </div>
                                </label>

                                <div className="grid grid-cols-2 gap-4">
                                    <label className="flex flex-col gap-2">
                                        <span className="text-sm font-medium text-white">Model</span>
                                        <div className="relative">
                                            <select
                                                className="w-full bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:outline focus:outline-1 focus:outline-border-dark focus:outline-offset-0 focus:ring-0 appearance-none"
                                                value={model}
                                                onChange={(e) => setModel(e.target.value)}
                                                disabled={loading}
                                            >
                                                {providers
                                                    .find((p) => p.id === providerId)?.models.map((m) => (
                                                        <option key={m.id} value={m.id}>
                                                            {m.label}
                                                        </option>
                                                    )) ?? null}
                                            </select>
                                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none text-[20px]">
                                                expand_more
                                            </span>
                                        </div>
                                    </label>

                                    <label className="flex flex-col gap-2">
                                        <span className="text-sm font-medium text-white">
                                            Temperature ({temperature.toFixed(1)})
                                        </span>
                                        <input
                                            className="w-full h-2 bg-border-dark rounded-lg appearance-none cursor-pointer accent-primary mt-3"
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.1}
                                            value={temperature}
                                            onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                            disabled={loading}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        <hr className="border-border-dark" />

                        {/* System Instruction */}
                        <div className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-white">System Instruction</span>
                            <div className="flex-1 bg-background-dark border border-border-dark rounded-lg p-3 relative group">
                                <textarea
                                    className="w-full h-full min-h-[240px] bg-transparent border-none p-0 text-sm text-gray-300 font-mono focus:outline focus:outline-1 focus:outline-border-dark focus:outline-offset-0 focus:ring-0 resize-none leading-relaxed agent-scroll"
                                    spellCheck={false}
                                    value={systemPrompt}
                                    onChange={(e) => setSystemPrompt(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <hr className="border-border-dark" />

                        {/* User Prompt */}
                        <div className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-white">User Prompt</span>
                            <div className="flex-1 bg-background-dark border border-border-dark rounded-lg p-3 relative group">
                                <textarea
                                    className="w-full h-full min-h-[200px] bg-transparent border-none p-0 text-sm text-gray-300 font-mono focus:outline focus:outline-1 focus:outline-border-dark focus:outline-offset-0 focus:ring-0 resize-none leading-relaxed agent-scroll"
                                    placeholder={"Ví dụ: Đây là input JSON: {{input_json}}\\nHãy trả về đúng JSON theo schema."}
                                    spellCheck={false}
                                    value={userPrompt}
                                    onChange={(e) => setUserPrompt(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 mt-1">{error}</p>
                        )}
                    </div>

                    {/* Panel Footer (row 3, fixed at bottom) */}
                    <div className="px-6 pb-6 pt-4 border-t border-border-dark flex items-center justify-end gap-3 bg-background-dark/30">
                        <button
                            type="button"
                            className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
                            onClick={closePanel}
                            disabled={loading}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-blue-600 shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 disabled:opacity-60"
                            disabled={loading}
                        >
                            <span className="material-symbols-outlined text-[18px]">save</span>
                            {loading ? "Đang lưu..." : "Lưu thay đổi"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
