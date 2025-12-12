'use client';

import { useState, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { createWorkflowForProject } from "@/lib/api";

export default function NewWorkflowPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const wf = await createWorkflowForProject(projectId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/workflows/${wf.id}/design`);
    } catch (err: any) {
      setError(err.message ?? "Failed to create workflow");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex flex-col gap-2 border-b border-slate-800 pb-4">
        <p className="text-sm text-slate-400">
          Projects / {projectId} / Workflows / Create
        </p>
        <h1 className="text-3xl font-black tracking-tight text-white">
          Tạo Workflow mới
        </h1>
        <p className="text-sm text-slate-400">
          Đặt tên và mô tả ngắn gọn cho workflow. Bước tiếp theo bạn có thể
          thiết kế chi tiết trên canvas.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-100" htmlFor="wf-name">
            Tên Workflow
          </label>
          <input
            id="wf-name"
            className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-100" htmlFor="wf-desc">
            Mô tả
          </label>
          <textarea
            id="wf-desc"
            className="w-full min-h-[140px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            className="h-11 px-5 rounded-lg border border-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-800"
            onClick={() => router.back()}
            disabled={loading}
          >
            Hủy
          </button>
          <button
            type="submit"
            className="h-11 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Đang lưu..." : "Lưu & mở Canvas"}
          </button>
        </div>
      </form>
    </div>
  );
}
