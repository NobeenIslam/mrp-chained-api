import { simulateJob } from '@/lib/jobs';

// Static values for Vercel deployment
// 4 jobs × 12s = 48s total, which exceeds maxDuration (40s)
// Vercel will kill this function before it completes
export const maxDuration = 40;
const TOTAL_STEPS = 4;
const JOB_DURATION_SECONDS = 12;

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
                durationSeconds: JOB_DURATION_SECONDS,
                timestamp: Date.now() - startTime,
              }) + '\n'
            )
          );

          const result = await simulateJob(step, JOB_DURATION_SECONDS);

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
