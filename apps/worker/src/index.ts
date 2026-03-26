import { startWorker } from "./queue";
import { runPipeline } from "./pipeline";
import { startEnqueueServer } from "./enqueue_server";

async function main() {
  startEnqueueServer();
  await startWorker({
    processJob: async (job) => {
      return runPipeline(job as any);
    }
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

