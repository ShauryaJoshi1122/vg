"use client";

import { useEffect, useMemo, useState } from "react";
import { DownloadButton } from "../../../components/DownloadButton";
import { StatusProgress } from "../../../components/StatusProgress";
import { VideoPlayer } from "../../../components/VideoPlayer";

type StatusResponse = {
  id: string;
  status: string;
  current_step: string | null;
  progress: number;
  final_video: null | {
    uri: string;
    download_url: string;
  };
};

export default function VideoStatusPage({ params }: { params: { id: string } }) {
  const jobId = params.id;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const [status, setStatus] = useState("queued");
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    async function poll() {
      try {
        const resp = await fetch(`${apiBase}/status/${encodeURIComponent(jobId)}`, {
          headers
        });
        if (!resp.ok) {
          throw new Error(await resp.text());
        }
        const data = (await resp.json()) as StatusResponse;
        if (cancelled) return;

        setStatus(data.status);
        setCurrentStep(data.current_step);
        setProgress(data.progress ?? 0);
        if (data.final_video?.download_url) {
          setDownloadUrl(data.final_video.download_url);
        }

        if (data.status === "succeeded") return;
        if (data.status === "failed") return;

        attempt += 1;
        const delay = Math.min(5000, 1000 + attempt * 500);
        setTimeout(poll, delay);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Polling failed");
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [apiBase, jobId, headers]);

  return (
    <main className="min-h-screen bg-white p-6">
      <h1 className="text-2xl font-semibold">Video generation</h1>
      <div className="mt-4 space-y-4">
        {error ? <div className="rounded bg-red-50 p-3 text-red-700">{error}</div> : null}
        <StatusProgress status={status} currentStep={currentStep} progress={progress} />
        {downloadUrl ? (
          <div className="space-y-3">
            <VideoPlayer downloadUrl={downloadUrl} />
            <DownloadButton downloadUrl={downloadUrl} />
          </div>
        ) : null}
      </div>
    </main>
  );
}

