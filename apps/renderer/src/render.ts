import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";

import { markJobFailed, markJobSucceeded, setJobRendering } from "./db";

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function downloadToFile(url: string, destPath: string) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to download ${url}: ${resp.status} ${text}`);
  }
  if (!resp.body) throw new Error(`No response body for ${url}`);
  await pipeline(resp.body as any, createWriteStream(destPath));
}

function guessExtFromUrl(url: string) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    return ext || "";
  } catch {
    return "";
  }
}

function buildObjectUrl(input: { bucket: string; key: string }) {
  const endpoint = process.env.S3_ENDPOINT_URL ?? "";
  const region = process.env.S3_REGION ?? "us-east-1";

  if (endpoint) {
    const e = endpoint.replace(/\/$/, "");
    return `${e}/${input.bucket}/${input.key}`;
  }
  return `https://${input.bucket}.s3.${region}.amazonaws.com/${input.key}`;
}

function s3Client() {
  const bucket = process.env.S3_BUCKET ?? "";
  const accessKey = process.env.S3_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID ?? "";
  const secretKey = process.env.S3_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? "";
  const region = process.env.S3_REGION ?? "us-east-1";
  const endpoint = process.env.S3_ENDPOINT_URL;

  if (!bucket) throw new Error("S3_BUCKET is required");
  if (!accessKey || !secretKey) throw new Error("S3 credentials are required");

  return new S3Client({
    region,
    endpoint: endpoint ? endpoint : undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }
  });
}

async function ensureDir(p: string) {
  await fs.promises.mkdir(p, { recursive: true });
}

export type RenderManifest = {
  jobId: string;
  scenes: Array<{
    index: number;
    durationSeconds: number;
    visualUri: string;
    audioUri: string;
  }>;
};

export async function renderVideoFromManifest(input: { jobId: string; manifest: RenderManifest }) {
  const { jobId, manifest } = input;
  const tmpRoot = path.join(os.tmpdir(), "videogen", String(jobId));
  await ensureDir(tmpRoot);

  await setJobRendering({ jobId });

  const fps = Number(process.env.RENDER_FPS ?? 30);
  const targetWidth = Number(process.env.RENDER_WIDTH ?? 1280);
  const preset = process.env.RENDER_PRESET ?? "veryfast";
  const crf = process.env.RENDER_CRF ?? "23";

  try {
    const segments: string[] = [];

    for (const scene of manifest.scenes) {
      const segPath = path.join(tmpRoot, `segment_${scene.index}.mp4`);

      const vExt = guessExtFromUrl(scene.visualUri) || ".img";
      const aExt = guessExtFromUrl(scene.audioUri) || ".audio";

      const visualPath = path.join(tmpRoot, `visual_${scene.index}${vExt}`);
      const audioPath = path.join(tmpRoot, `audio_${scene.index}${aExt}`);

      await downloadToFile(scene.visualUri, visualPath);
      await downloadToFile(scene.audioUri, audioPath);

      const duration = Math.max(1, Math.floor(scene.durationSeconds));
      const isVideoVisual = vExt === ".mp4" || vExt === ".webm" || vExt === ".mov" || vExt === ".mkv";

      if (isVideoVisual) {
        await run("ffmpeg", [
          "-y",
          "-i",
          visualPath,
          "-i",
          audioPath,
          "-t",
          String(duration),
          "-vf",
          `scale=${targetWidth}:-2,fps=${fps}`,
          "-c:v",
          "libx264",
          "-preset",
          preset,
          "-crf",
          crf,
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-shortest",
          segPath
        ]);
      } else {
        await run("ffmpeg", [
          "-y",
          "-loop",
          "1",
          "-i",
          visualPath,
          "-i",
          audioPath,
          "-t",
          String(duration),
          "-vf",
          `scale=${targetWidth}:-2,fps=${fps}`,
          "-c:v",
          "libx264",
          "-preset",
          preset,
          "-crf",
          crf,
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-shortest",
          segPath
        ]);
      }

      segments.push(segPath);
    }

    const listPath = path.join(tmpRoot, "concat_list.txt");
    const list = segments.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
    await fs.promises.writeFile(listPath, list, "utf8");

    const finalPath = path.join(tmpRoot, "final.mp4");
    await run("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      crf,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      finalPath
    ]);

    const bucket = process.env.S3_BUCKET ?? "";
    const key = `videos/${jobId}/final.mp4`;
    const finalUri = `s3://${bucket}/${key}`;

    const s3 = s3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(finalPath),
        ContentType: "video/mp4"
      })
    );

    await markJobSucceeded({ jobId, finalUri });
    return { finalVideoUri: finalUri };
  } catch (e: any) {
    await markJobFailed({ jobId, errorMessage: e?.message ?? "Render failed", errorCode: e?.name ?? "RenderError" });
    throw e;
  } finally {
    if (!process.env.RENDER_KEEP_TMP) {
      try {
        await fs.promises.rm(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

