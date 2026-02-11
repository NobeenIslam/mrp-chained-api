import { JobScenario } from '@prisma/client';
import { simulateJob } from '@/lib/jobs';
import {
  TOTAL_STEPS,
  SEQUENTIAL_JOB_DURATION_SECONDS,
  SEQUENTIAL_MAX_DURATION,
  RACE_TIMEOUT_SECONDS,
} from '@/lib/constants';
import {
  createRun,
  markRunComplete,
  markRunFailed,
  markStepComplete,
  markStepOngoing,
} from '@/lib/run-store';

// maxDuration must be a static literal for Vercel's build-time analysis
// 4 jobs × 6s = 24s total, which exceeds maxDuration (20s)
// Promise.race with 15s timeout aborts gracefully before Vercel kills the function
export const maxDuration = 10;

export async function POST() {
  const encoder = new TextEncoder();
  const raceTimeoutMs = RACE_TIMEOUT_SECONDS * 1000;
  const run = await createRun(JobScenario.RACE);
  const runId = run.id;

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      const completedSteps: number[] = [];
      let currentStep: number | undefined;

      const raceTimeout = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), raceTimeoutMs);
      });

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

          const result = await Promise.race([
            simulateJob(step, SEQUENTIAL_JOB_DURATION_SECONDS),
            raceTimeout,
          ]);

          if (result === 'timeout') {
            const message = `Promise.race timeout after ${RACE_TIMEOUT_SECONDS}s — aborting gracefully before Vercel's maxDuration (${SEQUENTIAL_MAX_DURATION}s) kills the process`;
            await markRunFailed(runId, message, step).catch((persistError) => {
              console.error(
                `[race] Run ${runId} failed to persist timeout:`,
                persistError
              );
            });

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'race_timeout',
                  runId,
                  completedSteps,
                  failedStep: step,
                  elapsed: Date.now() - startTime,
                  message,
                }) + '\n'
              )
            );
            controller.close();
            return;
          }

          completedSteps.push(step);
          await markStepComplete(runId, step, result.durationMs);

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
        }

        await markRunComplete(runId);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'done',
              runId,
              completedSteps,
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
              `[race] Run ${runId} failed to persist error:`,
              persistError
            );
          }
        );

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'error',
              runId,
              completedSteps,
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
