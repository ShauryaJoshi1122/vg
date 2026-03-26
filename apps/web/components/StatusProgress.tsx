"use client";

export function StatusProgress({
  status,
  currentStep,
  progress
}: {
  status: string;
  currentStep: string | null;
  progress: number;
}) {
  const pct = Math.max(0, Math.min(100, progress ?? 0));
  return (
    <div className="space-y-2 rounded border p-4">
      <div className="text-sm text-gray-600">Status: {status}</div>
      <div className="text-sm">
        Step: <span className="font-medium">{currentStep ?? "n/a"}</span>
      </div>
      <div className="text-sm text-gray-600">Progress: {pct}%</div>
      <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
        <div className="h-full bg-black" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

