import { Pool } from "pg";
import crypto from "crypto";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn("DATABASE_URL is not configured in renderer; DB updates will fail.");
}

export const pool = new Pool({ connectionString: databaseUrl });

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function upsertFinalVideoAsset(input: { jobId: string; uri: string }) {
  const id = crypto.randomUUID();
  const contentHash = sha256(input.uri);

  const sql = `
    INSERT INTO video_assets (id, job_id, asset_type, scene_index, uri, content_hash, metadata)
    VALUES ($1, $2, 'final_video', 0, $3, $4, $5)
    ON CONFLICT ON CONSTRAINT uq_video_assets_job_asset_scene
    DO UPDATE SET
      uri = EXCLUDED.uri,
      content_hash = EXCLUDED.content_hash,
      metadata = EXCLUDED.metadata
  `;

  await pool.query(sql, [id, input.jobId, input.uri, contentHash, null]);
}

export async function markJobSucceeded(input: { jobId: string; finalUri: string }) {
  await upsertFinalVideoAsset({ jobId: input.jobId, uri: input.finalUri });
  await pool.query(
    `UPDATE video_jobs
     SET status = 'succeeded',
         current_step = 'render_final_video',
         progress = 100,
         error_code = NULL,
         error_message = NULL
     WHERE id = $1`,
    [input.jobId]
  );

  // Record metering for billing/usage dashboards.
  const jobRes = await pool.query(`SELECT user_id FROM video_jobs WHERE id = $1`, [input.jobId]);
  const userId = jobRes.rows?.[0]?.user_id;
  if (userId) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO usage_events (id, user_id, job_id, units, unit_type)
       VALUES ($1, $2, $3, 1, 'video_generation')`,
      [id, userId, input.jobId]
    );
  }
}

export async function setJobRendering(input: { jobId: string }) {
  await pool.query(
    `UPDATE video_jobs
     SET status = 'running',
         current_step = 'render_final_video',
         progress = 90,
         error_code = NULL,
         error_message = NULL
     WHERE id = $1`,
    [input.jobId]
  );
}

export async function markJobFailed(input: { jobId: string; errorMessage: string; errorCode?: string }) {
  await pool.query(
    `UPDATE video_jobs
     SET status = 'failed',
         current_step = 'render_final_video',
         progress = 100,
         error_code = $2,
         error_message = $3
     WHERE id = $1`,
    [input.jobId, input.errorCode ?? null, input.errorMessage]
  );
}

