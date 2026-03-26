"use client";

import { useEffect, useState } from "react";

type Project = { id: string; name: string };
type Usage = {
  plan: string;
  used_videos_last_30_days: number;
  limit_videos_last_30_days: number;
  remaining: number;
};

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
        const resp = await fetch(`${apiBase}/projects`, {
          headers: localStorage.getItem("token")
            ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
            : {}
        });
        if (!resp.ok) {
          if (resp.status === 401) {
            window.location.href = "/auth";
            return;
          }
          throw new Error(`Failed: ${resp.status}`);
        }
        const data = await resp.json();
        setProjects(data.projects ?? []);

        const usageResp = await fetch(`${apiBase}/billing/usage`, {
          headers: localStorage.getItem("token")
            ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
            : {}
        });
        if (usageResp.status === 401) {
          window.location.href = "/auth";
          return;
        }
        if (usageResp.ok) {
          const u = await usageResp.json();
          setUsage(u as Usage);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load projects.");
      }
    })();
  }, []);

  async function onUpgradePro() {
    setError(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const resp = await fetch(`${apiBase}/billing/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({})
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail ?? "Failed to create checkout session");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message ?? "Upgrade failed.");
    }
  }

  return (
    <main className="min-h-screen bg-white p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {error ? <div className="mt-3 rounded bg-red-50 p-3 text-red-700">{error}</div> : null}

      {usage ? (
        <div className="mt-4 rounded border p-4">
          <div className="text-sm text-gray-600">Plan: {usage.plan}</div>
          <div className="mt-2 text-sm">
            Used {usage.used_videos_last_30_days} / {usage.limit_videos_last_30_days} videos (last 30 days)
          </div>
          <div className="mt-1 text-sm text-gray-600">Remaining: {usage.remaining}</div>
          {usage.plan === "free" ? (
            <button
              className="mt-3 rounded bg-black px-4 py-2 text-white"
              onClick={onUpgradePro}
            >
              Upgrade to Pro
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {projects.map((p) => (
          <div key={p.id} className="rounded border p-3">
            {p.name}
          </div>
        ))}
      </div>
    </main>
  );
}

