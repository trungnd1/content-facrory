import { getExecution, listExecutionSteps } from "@/lib/api";

export const dynamic = "force-dynamic";

interface Props {
  params: { executionId: string };
}

export default async function ExecutionDetailPage({ params }: Props) {
  const { executionId } = params;
  const [execution, steps] = await Promise.all([
    getExecution(executionId).catch(() => null),
    listExecutionSteps(executionId).catch(() => []),
  ]);

  if (!execution) {
    return (
      <p className="text-sm text-red-400">
        Không tìm thấy execution với ID {executionId}.
      </p>
    );
  }

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalCount = steps.length || 1;
  const progress = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Workflow Execution
          </h1>
          <p className="text-xs text-slate-400">
            ID: {execution.id} • Workflow: {execution.workflow_id} • Project:{" "}
            {execution.project_id}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/30">
            {execution.status}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-slate-950/60 border border-slate-800 p-4">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-white">Overall Progress</span>
          <span className="text-blue-400 font-semibold">{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[360px]">
        <div className="lg:col-span-1 rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-950">
            <h3 className="text-sm font-semibold text-white">Workflow Steps</h3>
            <span className="text-xs text-slate-400">{steps.length} steps</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {steps.map((step, idx) => (
              <div key={step.id} className="relative pl-6">
                {idx < steps.length - 1 && (
                  <div className="absolute left-[7px] top-4 h-full w-px bg-slate-700" />
                )}
                <div className="absolute left-0 top-2 flex h-3 w-3 items-center justify-center rounded-full bg-slate-900 border border-slate-600">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      step.status === "completed"
                        ? "bg-emerald-400"
                        : step.status === "running"
                        ? "bg-blue-400"
                        : step.status === "failed"
                        ? "bg-red-400"
                        : "bg-slate-500"
                    }`}
                  />
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <p className="text-xs font-semibold text-white">
                        Step {idx + 1}
                      </p>
                      {step.error && (
                        <p className="text-[11px] text-red-400 mt-1">
                          {step.error}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                      {step.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {steps.length === 0 && (
              <p className="text-xs text-slate-500">
                Chưa có step nào được ghi lại cho execution này.
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white">Execution Result</h3>
          <pre className="flex-1 text-xs text-slate-300 bg-slate-900/80 rounded-lg p-3 overflow-auto">
            {execution.result ?? "(chưa có output hoặc đang chạy)"}
          </pre>
        </div>
      </div>
    </div>
  );
}
