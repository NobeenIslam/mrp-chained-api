import { simulateJob } from '@/lib/jobs';
import { config } from '@/lib/config';

export const maxDuration = 39;

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      const completedSteps: number[] = [];

      const raceTimeout = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), config.raceTimeoutMs);
      });

      try {
        for (let step = 1; step <= config.totalSteps; step++) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'start',
                step,
                timestamp: Date.now() - startTime,
              }) + '\n'
            )
          );

          const result = await Promise.race([simulateJob(step), raceTimeout]);

          if (result === 'timeout') {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'race_timeout',
                  completedSteps,
                  failedStep: step,
                  elapsed: Date.now() - startTime,
                  message: `Promise.race timeout after ${config.raceTimeoutMs}ms — aborting gracefully before Vercel's maxDuration (${maxDuration}s) kills the process`,
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
                duration: result.duration,
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
              message:
                error instanceof Error ? error.message : 'Unknown error',
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
