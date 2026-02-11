import { simulateJob } from '@/lib/jobs';
import { config } from '@/lib/config';

export const maxDuration = 39;

export async function POST() {
  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, config.simulatedTimeoutMs);

      const startTime = Date.now();

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

          const result = await simulateJob(step, abortController.signal);

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
              timestamp: Date.now() - startTime,
            }) + '\n'
          )
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'timeout',
                elapsed: Date.now() - startTime,
                message: `Simulated Vercel timeout after ${config.simulatedTimeoutMs}ms (maxDuration exceeded)`,
              }) + '\n'
            )
          );
        } else {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                elapsed: Date.now() - startTime,
                message:
                  error instanceof Error ? error.message : 'Unknown error',
              }) + '\n'
            )
          );
        }
      } finally {
        clearTimeout(timeoutId);
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
