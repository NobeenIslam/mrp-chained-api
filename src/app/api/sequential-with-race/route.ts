import { simulateJob } from '@/lib/jobs';
import {
  TOTAL_STEPS,
  SEQUENTIAL_JOB_DURATION_SECONDS,
  SEQUENTIAL_MAX_DURATION,
  RACE_TIMEOUT_SECONDS,
} from '@/lib/constants';

// maxDuration must be a static literal for Vercel's build-time analysis
// 4 jobs × 6s = 24s total, which exceeds maxDuration (20s)
// Promise.race with 15s timeout aborts gracefully before Vercel kills the function
export const maxDuration = 20;

export async function POST() {
  const encoder = new TextEncoder();
  const raceTimeoutMs = RACE_TIMEOUT_SECONDS * 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      const completedSteps: number[] = [];

      const raceTimeout = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), raceTimeoutMs);
      });

      try {
        for (let step = 1; step <= TOTAL_STEPS; step++) {

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'start',
                step,
                durationSeconds: SEQUENTIAL_JOB_DURATION_SECONDS,
                timestamp: Date.now() - startTime,
              }) + '\n'
            )
          );

          const result = await Promise.race([
            simulateJob(step, SEQUENTIAL_JOB_DURATION_SECONDS),
            raceTimeout,
          ]);

          if (result === 'timeout') {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'race_timeout',
                  completedSteps,
                  failedStep: step,
                  elapsed: Date.now() - startTime,
                  message: `Promise.race timeout after ${RACE_TIMEOUT_SECONDS}s — aborting gracefully before Vercel's maxDuration (${SEQUENTIAL_MAX_DURATION}s) kills the process`,
                }) + '\n'
              )
            );
            controller.close();
            return;
          }

          completedSteps.push(step);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'complete',
                step,
                durationMs: result.durationMs,
                timestamp: Date.now() - startTime,
              }) + '\n'
            )
          );
        }

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'done',
              completedSteps,
              timestamp: Date.now() - startTime,
            }) + '\n'
          )
        );
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'error',
              completedSteps,
              elapsed: Date.now() - startTime,
              message: error instanceof Error ? error.message : 'Unknown error',
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
