"use client";

import { useState } from "react";

type GenerateVideoResponse = {
  id: string;
  status: string;
};

export function PromptForm() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = prompt.trim();
    if (trimmed.length < 10) {
      setError("Prompt must be at least 10 characters.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/auth";
      setError("Please log in to generate videos.");
      return;
    }

    setLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const resp = await fetch(`${apiBase}/generate-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt })
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Request failed: ${resp.status}`);
      }

      const data = (await resp.json()) as GenerateVideoResponse;
      window.location.href = `/video/${encodeURIComponent(data.id)}`;
    } catch (err: any) {
      setError(err?.message ?? "Failed to start generation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Generate a video</h1>
      <p className="mt-2 text-sm text-gray-600">
        Enter a prompt, and our system will generate a script, scenes, visuals, voice, and render an MP4.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <textarea
          className="w-full rounded border p-3"
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A short story about a robot learning to paint..."
        />
        {error ? <div className="rounded bg-red-50 p-3 text-red-700">{error}</div> : null}
        <button
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "Generating..." : "Generate video"}
        </button>
      </form>
    </div>
  );
}

