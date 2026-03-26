"use client";

type Props = {
  downloadUrl: string;
};

export function VideoPlayer({ downloadUrl }: Props) {
  return (
    <div className="rounded border p-4">
      <video className="w-full" controls src={downloadUrl} />
    </div>
  );
}

