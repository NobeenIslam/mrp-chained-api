import { simulateJob } from '@/lib/jobs';
import { config } from '@/lib/config';

export const maxDuration = config.sequential.maxDuration;

export async function POST() {
  const encoder = new TextEncoder();
  const raceTimeoutMs = config.sequential.raceTimeout * 1000;

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      const completedSteps: number[] = [];

      const raceTimeout = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), raceTimeoutMs);
      });

      try {
        for (let step = 1; step <= config.totalSteps; step++) {
          const durationSeconds = config.chained.jobDurations[step - 1] ?? 10;

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'start',
                step,
                durationSeconds,
                timestamp: Date.now() - startTime,
              }) + '\n'
            )
          );

          const result = await Promise.race([
            simulateJob(step, durationSeconds),
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
                  message: `Promise.race timeout after ${config.sequential.raceTimeout}s — aborting gracefully before Vercel's maxDuration (${maxDuration}s) kills the process`,
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
