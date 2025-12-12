'use client';

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createAgent } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";

export default function NewAgentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setLoading(true);
      setError(null);
      await createAgent({
        name: name.trim(),
        description: description.trim() || undefined,
        model: llmModel.trim() || undefined,
      });
      router.push("/agents");
    } catch (err: any) {
      setError(err.message ?? "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-full">
      <Sidebar active="agents" />

      <main className="flex flex-1 flex-col overflow-hidden bg-background-light dark:bg-background-dark relative">
        {/* Mobile top bar to match other screens */}
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
            <div className="flex flex-col gap-2 border-b border-[#282b39] pb-4">
              <p className="text-sm text-[#9da1b9]">Agents / Tạo mới</p>
              <h1 className="text-white text-3xl md:text-4xl font-black tracking-[-0.033em] leading-tight">
                Thêm Agent mới
              </h1>
              <p className="text-[#9da1b9] text-sm md:text-base font-normal leading-normal max-w-2xl">
                Định nghĩa một trợ lý AI với mô hình và mô tả rõ ràng.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white" htmlFor="agent-name">
                  Tên Agent
                </label>
                <input
                  id="agent-name"
                  className="w-full h-11 rounded-lg border border-[#282b39] bg-[#1a1d24] px-3 text-sm text-white placeholder:text-[#9da1b9] focus:outline-none focus:ring-2 focus:ring-primary/60"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white" htmlFor="agent-llm">
                  Mô hình LLM
                </label>
                <input
                  id="agent-llm"
                  className="w-full h-11 rounded-lg border border-[#282b39] bg-[#1a1d24] px-3 text-sm text-white placeholder:text-[#9da1b9] focus:outline-none focus:ring-2 focus:ring-primary/60"
                  placeholder="Ví dụ: gpt-4.1, claude-3.5, ..."
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white" htmlFor="agent-desc">
                  Mô tả
                </label>
                <textarea
                  id="agent-desc"
                  className="w-full min-h-[140px] rounded-lg border border-[#282b39] bg-[#1a1d24] px-3 py-2 text-sm text-white placeholder:text-[#9da1b9] focus:outline-none focus:ring-2 focus:ring-primary/60 resize-y"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex justify-end gap-3 pt-4 border-t border-[#282b39]">
                <button
                  type="button"
                  className="h-10 px-5 rounded-lg border border-[#282b39] text-sm font-medium text-[#9da1b9] hover:bg-[#282b39]"
                  onClick={() => router.back()}
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="h-10 px-6 rounded-lg bg-primary hover:bg-blue-700 text-sm font-bold text-white shadow-[0_0_15px_rgba(19,55,236,0.3)] disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? "Đang lưu..." : "Lưu Agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
