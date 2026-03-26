import { renderQueue, type VideoGenerationJobData } from "../queue";
import { breakdownScenes, generateScript } from "../llm_client";
import { generateVisual, synthesizeVoice } from "../flow_client";
import { getScenesJson, getSceneUris, setVideoJobFailed, setVideoJobProgress, upsertVideoAsset, sha256 } from "../db";
import { retryable } from "../retry";

export async function runPipeline(job: { data: VideoGenerationJobData }) {
  const prompt = job.data.prompt;
  const targetDurationSeconds = job.data.targetDurationSeconds ?? undefined;

  await setVideoJobProgress({
    jobId: job.data.jobId,
    status: "running",
    currentStep: "generate_script",
    progress: 5
  });

  // Heuristic caps to keep renders fast.
  const maxScenes = targetDurationSeconds
    ? Math.max(3, Math.min(10, Math.floor(targetDurationSeconds / 4)))
    : 8;

  try {
    const scriptResult = await retryable(() => generateScript(prompt), { attempts: 4 });

    await setVideoJobProgress({
      jobId: job.data.jobId,
      status: "running",
      currentStep: "breakdown_scenes",
      progress: 25
    });

    const breakdown = await retryable(
      () =>
        breakdownScenes({
          prompt,
          script: scriptResult.script,
          targetDurationSeconds,
          maxScenes
        }),
      { attempts: 4 }
    );

  // Normalize scene indices and clamp durations again defensively.
  const scenes = breakdown.scenes
    .map((s, idx) => ({
      index: idx,
      durationSeconds: Math.max(1, Math.min(20, Math.floor(s.durationSeconds))),
      visualPrompt: s.visualPrompt,
      voiceText: s.voiceText
    }))
    .slice(0, maxScenes);

    // Persist script + scene plan so later steps can build a render manifest
    // from DB state (for resuming/retries).
    await retryable(
      () =>
        upsertVideoAsset({
          jobId: job.data.jobId,
          assetType: "script",
          sceneIndex: 0,
          uri: `inline://script/${job.data.jobId}`,
          contentHash: sha256(scriptResult.script),
          metadata: { script: scriptResult.script }
        }),
      { attempts: 3 }
    );

    await retryable(
      () =>
        upsertVideoAsset({
          jobId: job.data.jobId,
          assetType: "scenes_json",
          sceneIndex: 0,
          uri: `inline://scenes_json/${job.data.jobId}`,
          contentHash: sha256(JSON.stringify(scenes)),
          metadata: { scenes }
        }),
      { attempts: 3 }
    );

  // Next to-do will generate Flow visuals + TTS for these scenes.
  await setVideoJobProgress({
    jobId: job.data.jobId,
    status: "running",
    currentStep: "generate_visuals_and_voice",
    progress: 35
  });

    const styleProfile = job.data.styleProfile ?? null;
    const voiceProfile = job.data.voiceProfile ?? null;

    // Cache/resume optimization:
    // If visual+audio already exist for a scene, skip Flow calls for that scene.
    const existingVisualUris = await getSceneUris({ jobId: job.data.jobId, assetType: "scene_visual" });
    const existingAudioUris = await getSceneUris({ jobId: job.data.jobId, assetType: "scene_audio" });

    const sceneConcurrency = Number(process.env.SCENE_CONCURRENCY ?? 4);
    for (let start = 0; start < scenes.length; start += sceneConcurrency) {
      const batch = scenes.slice(start, start + sceneConcurrency);
      await Promise.all(
        batch.map(async (scene, offset) => {
          const idx = start + offset;
          const hasVisual = Boolean(existingVisualUris[idx]);
          const hasAudio = Boolean(existingAudioUris[idx]);

          if (!hasVisual) {
            const visual = await retryable(
              () =>
                generateVisual({ scenePrompt: scene.visualPrompt, styleProfile }),
              { attempts: 4 }
            );
            await retryable(
              () =>
                upsertVideoAsset({
                  jobId: job.data.jobId,
                  assetType: "scene_visual",
                  sceneIndex: idx,
                  uri: visual.uri,
                  contentHash: sha256(`${scene.visualPrompt}|${styleProfile ?? ""}`)
                }),
              { attempts: 3 }
            );
          }

          if (!hasAudio) {
            const audio = await retryable(
              () => synthesizeVoice({ text: scene.voiceText, voiceProfile }),
              { attempts: 4 }
            );
            await retryable(
              () =>
                upsertVideoAsset({
                  jobId: job.data.jobId,
                  assetType: "scene_audio",
                  sceneIndex: idx,
                  uri: audio.uri,
                  contentHash: sha256(`${scene.voiceText}|${voiceProfile ?? ""}`)
                }),
              { attempts: 3 }
            );
          }

          const sceneProgress = 35 + Math.round(((idx + 1) / scenes.length) * 40);
          await setVideoJobProgress({
            jobId: job.data.jobId,
            status: "running",
            currentStep: "generate_visuals_and_voice",
            progress: Math.max(0, Math.min(90, sceneProgress))
          });
        })
      );
    }

    // Build render manifest from DB asset URIs and scene timings.
    const scenesJson = await getScenesJson({ jobId: job.data.jobId });
    const scenePlan: Array<any> = scenesJson?.scenes ?? scenes;
    const visualUris = await getSceneUris({ jobId: job.data.jobId, assetType: "scene_visual" });
    const audioUris = await getSceneUris({ jobId: job.data.jobId, assetType: "scene_audio" });

    const renderManifest = {
      jobId: job.data.jobId,
      scenes: scenePlan.map((s: any, idx: number) => ({
        index: idx,
        durationSeconds: Math.max(1, Math.min(20, Math.floor(s.durationSeconds))),
        visualUri: visualUris[idx],
        audioUri: audioUris[idx]
      }))
    };

    // Persist render manifest for resuming/debugging.
    await retryable(
      () =>
        upsertVideoAsset({
          jobId: job.data.jobId,
          assetType: "render_manifest",
          sceneIndex: 0,
          uri: `inline://render_manifest/${job.data.jobId}`,
          contentHash: sha256(JSON.stringify(renderManifest)),
          metadata: { renderManifest }
        }),
      { attempts: 3 }
    );

    // Trigger renderer worker.
    await retryable(
      () =>
        renderQueue.add(
          "render",
          { jobId: job.data.jobId, manifest: renderManifest },
          { jobId: `${job.data.jobId}:render`, attempts: 2 }
        ),
      { attempts: 2 }
    );

    await setVideoJobProgress({
      jobId: job.data.jobId,
      status: "running",
      currentStep: "render_queued",
      progress: 85
    });

    return { script: scriptResult.script, scenes, renderManifest };
  } catch (e: any) {
    await setVideoJobFailed({
      jobId: job.data.jobId,
      currentStep: "pipeline",
      errorCode: e?.name ?? "PipelineError",
      errorMessage: e?.message ?? "Unknown pipeline error"
    });
    throw e;
  }
}

