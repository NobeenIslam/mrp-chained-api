import { JobScenario } from '@prisma/client';
import { simulateJob } from '@/lib/jobs';
import { TOTAL_STEPS, SEQUENTIAL_JOB_DURATION_SECONDS } from '@/lib/constants';
import {
  createRun,
  markRunComplete,
  markRunFailed,
  markStepComplete,
  markStepOngoing,
} from '@/lib/run-store';

// maxDuration must be a static literal for Vercel's build-time analysis
// 4 jobs × 6s = 24s total, which exceeds maxDuration (20s)
// Vercel will kill this function before it completes
export const maxDuration = 10;

export async function POST() {
  const encoder = new TextEncoder();
  const run = await createRun(JobScenario.SEQUENTIAL);
  const runId = run.id;

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let currentStep: number | undefined;

      try {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'run_started',
              runId,
              timestamp: 0,
            }) + '\n'
          )
        );

        for (let step = 1; step <= TOTAL_STEPS; step++) {
          currentStep = step;
          await markStepOngoing(runId, step);

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'start',
                runId,
                step,
                durationSeconds: SEQUENTIAL_JOB_DURATION_SECONDS,
                timestamp: Date.now() - startTime,
              }) + '\n'
            )
          );

          const result = await simulateJob(
            step,
            SEQUENTIAL_JOB_DURATION_SECONDS
          );

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'complete',
                runId,
                step,
                durationMs: result.durationMs,
                timestamp: Date.now() - startTime,
              }) + '\n'
            )
          );

          await markStepComplete(runId, step, result.durationMs);
        }

        await markRunComplete(runId);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'done',
              runId,
              timestamp: Date.now() - startTime,
            }) + '\n'
          )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        await markRunFailed(runId, message, currentStep).catch(
          (persistError) => {
            console.error(
              `[sequential] Run ${runId} failed to persist error:`,
              persistError
            );
          }
        );

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'error',
              runId,
              elapsed: Date.now() - startTime,
              message,
            }) + '\n'
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    },
  });
}
