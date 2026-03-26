"use client";

export function DownloadButton({ downloadUrl }: { downloadUrl: string | null }) {
  if (!downloadUrl) return null;
  return (
    <a
      className="inline-flex rounded bg-black px-4 py-2 text-white"
      href={downloadUrl}
      download
    >
      Download MP4
    </a>
  );
}

