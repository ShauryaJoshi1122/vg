export type RenderManifest = {
  jobId: string;
  scenes: Array<{
    index: number;
    durationSeconds: number;
    visualUri: string;
    audioUri: string;
  }>;
};

export function buildRenderManifest(input: any): RenderManifest {
  // TODO: implement manifest generation from `video_assets` DB rows.
  return {
    jobId: input?.jobId ?? "unknown",
    scenes: Array.isArray(input?.scenes) ? input.scenes : []
  };
}

