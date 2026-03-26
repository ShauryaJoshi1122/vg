import IORedis from "ioredis";
import { Worker } from "bullmq";
import { renderVideoFromManifest } from "./render";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const renderQueueName = process.env.RENDER_QUEUE_NAME ?? "video-render";

async function main() {
  const worker = new Worker(
    renderQueueName,
    async (bullJob) => {
      const data = (bullJob as any)?.data ?? {};
      const manifest = data.manifest;
      const jobId = data.jobId;
      if (!jobId || !manifest) throw new Error("Missing render job data");
      return renderVideoFromManifest({ jobId, manifest });
    },
    {
      connection,
      concurrency: Number(process.env.RENDER_CONCURRENCY ?? 1),
      removeOnComplete: true,
      removeOnFail: 200
    }
  );

  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error("Render job failed", job?.id, err);
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

