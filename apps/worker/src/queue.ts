import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null
});

export const videoGenerationQueueName = "video-generation";
export const videoGenerationDeadLetterQueueName = "video-generation-dlq";
export const renderQueueName = "video-render";

export const renderQueue = new Queue(renderQueueName, { connection });

export const videoGenerationQueue = new Queue(videoGenerationQueueName, {
  connection
});

export const videoGenerationDeadLetterQueue = new Queue(videoGenerationDeadLetterQueueName, {
  connection
});

export type VideoGenerationJobData = {
  jobId: string;
  userId: string;
  projectId: string | null;
  prompt: string;
  styleProfile?: string | null;
  voiceProfile?: string | null;
  targetDurationSeconds?: number | null;
};

export async function startWorker(opts: {
  processJob: (job: { data: VideoGenerationJobData }) => Promise<any>;
}) {
  const worker = new Worker(
    videoGenerationQueueName,
    async (bullJob) => {
      return opts.processJob(bullJob as any);
    },
    {
      connection,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
      // If the process crashes, BullMQ will retry based on `attempts` set at job creation.
      // Step-level retries are handled in the pipeline.
      removeOnComplete: true,
      removeOnFail: 200,
      // BullMQ will move failed jobs to failed set; we additionally push a DLQ record.
      // Step-level retry should be handled within the pipeline logic.
    }
  );

  worker.on("completed", (job) => {
    // eslint-disable-next-line no-console
    console.log(`Job completed: ${job.id}`);
  });
  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`Job failed: ${job?.id}`, err);

    // Best-effort DLQ add for later inspection/retry UI.
    if (job?.data) {
      videoGenerationDeadLetterQueue.add(
        "failed",
        {
          jobId: job.data.jobId,
          userId: job.data.userId,
          projectId: job.data.projectId,
          prompt: job.data.prompt,
          failedAt: new Date().toISOString(),
          error: err
            ? {
                message: (err as any)?.message ?? "unknown",
                name: (err as any)?.name ?? "Error"
              }
            : null
        },
        { jobId: String(job?.id) }
      ).catch(() => {
        // eslint-disable-next-line no-console
        console.error("Failed to enqueue DLQ record");
      });
    }
  });

  return worker;
}

