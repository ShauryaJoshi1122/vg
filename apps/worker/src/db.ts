import { Pool } from "pg";
import crypto from "crypto";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn("DATABASE_URL is not configured in worker; DB writes will fail.");
}

export const pool = new Pool({
  connectionString: databaseUrl
});

export type VideoAssetType =
  | "script"
  | "scenes_json"
  | "scene_visual"
  | "scene_audio"
  | "render_manifest"
  | "final_video";

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function upsertVideoAsset(input: {
  jobId: string;
  assetType: VideoAssetType;
  sceneIndex: number | null;
  uri: string;
  contentHash?: string;
  metadata?: Record<string, any> | null;
}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const id = crypto.randomUUID();
  const contentHash = input.contentHash ?? sha256(input.uri);

  // Note: unique constraint is (job_id, asset_type, scene_index).
  // We target the constraint by name set in the Alembic migration.
  const sql = `
    INSERT INTO video_assets (id, job_id, asset_type, scene_index, uri, content_hash, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT ON CONSTRAINT uq_video_assets_job_asset_scene
    DO UPDATE SET
      uri = EXCLUDED.uri,
      content_hash = EXCLUDED.content_hash,
      metadata = EXCLUDED.metadata
  `;

  const sceneIndex = input.sceneIndex;
  await pool.query(sql, [
    id,
    input.jobId,
    input.assetType,
    sceneIndex,
    input.uri,
    contentHash,
    input.metadata ?? null
  ]);
}

export async function setVideoJobProgress(input: {
  jobId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  currentStep: string | null;
  progress: number;
}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  await pool.query(
    `
    UPDATE video_jobs
    SET status = $2,
        current_step = $3,
        progress = $4,
        updated_at = now()
    WHERE id = $1
    `,
    [input.jobId, input.status, input.currentStep, input.progress]
  );
}

export async function setVideoJobFailed(input: { jobId: string; currentStep?: string | null; errorCode?: string; errorMessage: string }) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  await pool.query(
    `
    UPDATE video_jobs
    SET status = 'failed',
        current_step = $2,
        progress = 100,
        error_code = $3,
        error_message = $4,
        updated_at = now()
    WHERE id = $1
    `,
    [input.jobId, input.currentStep ?? "error", input.errorCode ?? null, input.errorMessage]
  );
}

export async function getScenesJson(input: { jobId: string }) {
  const sql = `
    SELECT metadata
    FROM video_assets
    WHERE job_id = $1 AND asset_type = 'scenes_json' AND scene_index = 0
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const res = await pool.query(sql, [input.jobId]);
  if (res.rowCount === 0) return null;
  return res.rows[0]?.metadata ?? null;
}

export async function getSceneUris(input: { jobId: string; assetType: VideoAssetType }) {
  const sql = `
    SELECT scene_index, uri
    FROM video_assets
    WHERE job_id = $1 AND asset_type = $2 AND scene_index IS NOT NULL
    ORDER BY scene_index ASC
  `;
  const res = await pool.query(sql, [input.jobId, input.assetType]);
  return res.rows.reduce((acc: Record<number, string>, row: any) => {
    const idx = Number(row.scene_index);
    acc[idx] = row.uri;
    return acc;
  }, {});
}


