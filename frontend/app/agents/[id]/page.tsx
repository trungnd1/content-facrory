'use client';

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAgent, updateAgent, deleteAgent } from "@/lib/api";

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const agentId = params.id;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAgent(agentId);
        setName(data.name ?? "");
        setDescription(data.description ?? "");
        setLlmModel(data.llm_model ?? "");
      } catch (err: any) {
        setError(err.message ?? "Failed to load agent");
      } finally {
        setLoading(false);
      }
    }
    if (agentId) {
      load();
    }
  }, [agentId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await updateAgent(agentId, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        llm_model: llmModel.trim() || undefined,
      });
      router.push("/agents");
    } catch (err: any) {
      setError(err.message ?? "Failed to update agent");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Xóa agent này?")) return;
    try {
      setSaving(true);
      await deleteAgent(agentId);
      router.push("/agents");
    } catch (err: any) {
      setError(err.message ?? "Failed to delete agent");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Đang tải agent...</p>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex flex-col gap-2 border-b border-slate-800 pb-4">
        <p className="text-sm text-slate-400">Agents / Chỉnh sửa</p>
        <h1 className="text-3xl font-black tracking-tight text-white">Chỉnh sửa Agent</h1>
        <p className="text-sm text-slate-400">
          Cấu hình tính cách, mô hình và prompt cho agent này.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-100" htmlFor="agent-name">
            Tên Agent
          </label>
          <input
            id="agent-name"
            className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-100" htmlFor="agent-llm">
            Mô hình LLM
          </label>
          <input
            id="agent-llm"
            className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="Ví dụ: gpt-4.1, claude-3.5, ..."
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-100" htmlFor="agent-desc">
            Mô tả
          </label>
          <textarea
            id="agent-desc"
            className="w-full min-h-[140px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-between items-center pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm text-red-400 hover:text-red-300"
            disabled={saving}
          >
            Xóa Agent
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              className="h-11 px-5 rounded-lg border border-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-800"
              onClick={() => router.back()}
              disabled={saving}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="h-11 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
