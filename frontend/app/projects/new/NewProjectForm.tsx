
'use client';

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createProject, getProject, updateProject } from "@/lib/api";

export function NewProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const isEdit = Boolean(projectId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    let canceled = false;
    setLoading(true);
    getProject(projectId)
      .then((project) => {
        if (canceled) return;
        setName(project.name ?? "");
        setDescription(project.description ?? "");
      })
      .catch((err: any) => {
        if (canceled) return;
        setError(err.message ?? "Failed to load project");
      })
      .finally(() => {
        if (canceled) return;
        setLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [projectId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setLoading(true);
      setError(null);
      if (isEdit && projectId) {
        const project = await updateProject(projectId, {
          name: name.trim(),
          description: description.trim() || undefined,
        });
        router.push(`/projects/${project.id}/workflows`);
      } else {
        const project = await createProject({
          name: name.trim(),
          description: description.trim() || undefined,
        });
        router.push(`/projects/${project.id}/workflows`);
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-2 border-b border-[#282b39] pb-4">
        <p className="text-sm text-[#9da1b9]">
          Projects / {isEdit ? "Edit" : "Create"}
        </p>
        <h1 className="text-white text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">
          {isEdit ? "Chỉnh sửa Project" : "Tạo Project Mới"}
        </h1>
        <p className="text-[#9da1b9] text-sm md:text-base font-normal leading-normal max-w-2xl">
          Thiết lập không gian làm việc cho quy trình AI của bạn. {" "}
          {isEdit
            ? "Cập nhật tên và mô tả của dự án hiện có."
            : "Tạo mới một dự án để bắt đầu quản lý workflows và agents."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl">
        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-white"
            htmlFor="project-name"
          >
            Tên Project
          </label>
          <input
            id="project-name"
            className="w-full h-11 rounded-lg border border-[#282b39] bg-[#1a1d24] px-3 text-sm text-white placeholder:text-[#9da1b9] focus:outline-none focus:ring-2 focus:ring-primary/60"
            placeholder="Ví dụ: Chiến dịch Marketing Q3..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            className="text-sm font-medium text-white"
            htmlFor="project-desc"
          >
            Mô tả Project
          </label>
          <textarea
            id="project-desc"
            className="w-full min-h-[140px] rounded-lg border border-[#282b39] bg-[#1a1d24] px-3 py-2 text-sm text-white placeholder:text-[#9da1b9] focus:outline-none focus:ring-2 focus:ring-primary/60 resize-y"
            placeholder="Mô tả mục tiêu và phạm vi của dự án này..."
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
            {loading ? "Đang lưu..." : "Lưu Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
