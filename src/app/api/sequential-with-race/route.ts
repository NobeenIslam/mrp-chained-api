import { simulateJob } from '@/lib/jobs';

// Static values for Vercel deployment
// 4 jobs × 12s = 48s total, which exceeds maxDuration (40s)
// Promise.race with 35s timeout aborts gracefully before Vercel kills the function
export const maxDuration = 40;
const TOTAL_STEPS = 4;
const JOB_DURATION_SECONDS = 12;
const RACE_TIMEOUT_SECONDS = 35;

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
                durationSeconds: JOB_DURATION_SECONDS,
                timestamp: Date.now() - startTime,
              }) + '\n'
            )
          );

          const result = await Promise.race([
            simulateJob(step, JOB_DURATION_SECONDS),
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
                  message: `Promise.race timeout after ${RACE_TIMEOUT_SECONDS}s — aborting gracefully before Vercel's maxDuration (${maxDuration}s) kills the process`,
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
