import { createServer, IncomingMessage, ServerResponse } from "http";
import { videoGenerationQueue, videoGenerationQueueName, type VideoGenerationJobData } from "./queue";

function readJson(req: IncomingMessage) {
  return new Promise<any>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (d) => chunks.push(Buffer.from(d)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (!raw) return resolve({});
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export function startEnqueueServer() {
  const port = Number(process.env.ENQUEUE_SERVER_PORT ?? 3001);

  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "POST" || req.url !== "/internal/enqueue") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      const body = await readJson(req);
      const data: VideoGenerationJobData = {
        jobId: String(body.jobId),
        userId: String(body.userId),
        projectId: body.projectId ? String(body.projectId) : null,
        prompt: String(body.prompt ?? ""),
        styleProfile: body.styleProfile ? String(body.styleProfile) : null,
        voiceProfile: body.voiceProfile ? String(body.voiceProfile) : null,
        targetDurationSeconds:
          body.targetDurationSeconds === null || body.targetDurationSeconds === undefined
            ? null
            : Number(body.targetDurationSeconds)
      };

      if (!data.jobId || !data.userId || data.prompt.length < 10) {
        res.statusCode = 400;
        res.end("Invalid payload");
        return;
      }

      // Step-level retries are handled later; here we rely on BullMQ attempts as a job-level safety net.
      await videoGenerationQueue.add(
        "generate",
        data,
        {
          jobId: data.jobId,
          attempts: 4,
          backoff: { type: "exponential", delay: 1000 }
        }
      );

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, queue: videoGenerationQueueName }));
    } catch (e: any) {
      res.statusCode = 500;
      res.end(e?.message ?? "Internal error");
    }
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Enqueue server listening on :${port}`);
  });

  return server;
}

