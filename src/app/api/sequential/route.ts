import { simulateJob } from '@/lib/jobs';
import {
  TOTAL_STEPS,
  SEQUENTIAL_JOB_DURATION_SECONDS,
} from '@/lib/constants';

// maxDuration must be a static literal for Vercel's build-time analysis
// 4 jobs × 6s = 24s total, which exceeds maxDuration (20s)
// Vercel will kill this function before it completes
export const maxDuration = 20;

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();

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

          const result = await simulateJob(step, SEQUENTIAL_JOB_DURATION_SECONDS);

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
              timestamp: Date.now() - startTime,
            }) + '\n'
          )
        );
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'error',
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
