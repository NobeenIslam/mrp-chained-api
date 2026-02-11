import { after, NextResponse } from 'next/server';
import { simulateJob } from '@/lib/jobs';
import { config } from '@/lib/config';
import {
  createRun,
  markJobRunning,
  markJobComplete,
  markJobFailed,
} from '@/lib/chain-store';

export const maxDuration = config.chained.maxDuration;

const VALID_STEPS = new Set([1, 2, 3, 4]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ step: string }> }
) {
  const { step: stepParam } = await params;
  const step = Number(stepParam);

  if (!VALID_STEPS.has(step)) {
    return NextResponse.json(
      { error: `Invalid step: ${stepParam}. Must be 1-${config.totalSteps}.` },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const runId: string = body.runId ?? crypto.randomUUID();

  if (step === 1) {
    createRun(runId, config.totalSteps);
  }

  const durationSeconds = config.chained.jobDurations[step - 1] ?? 10;

  console.log(
    `[chained] Run ${runId} — Step ${step} starting (${durationSeconds}s)...`
  );
  markJobRunning(runId, step);

  try {
    const result = await simulateJob(step, durationSeconds);
    markJobComplete(runId, step, result.durationMs);
    console.log(
      `[chained] Run ${runId} — Step ${step} complete (${result.durationMs}ms)`
    );

    const nextStep = step + 1;

    if (nextStep <= config.totalSteps) {
      const origin = new URL(request.url).origin;

      after(async () => {
        console.log(
          `[after] Run ${runId} — Triggering step ${nextStep} from after()`
        );
        try {
          await fetch(`${origin}/api/chained/${nextStep}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId }),
          });
        } catch (err) {
          console.error(
            `[after] Run ${runId} — Failed to trigger step ${nextStep}:`,
            err
          );
          markJobFailed(
            runId,
            nextStep,
            err instanceof Error ? err.message : 'Failed to trigger'
          );
        }
      });
    } else {
      after(() => {
        console.log(
          `[after] Run ${runId} — All steps complete at ${new Date().toISOString()}`
        );
      });
    }

    return NextResponse.json({ runId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    markJobFailed(runId, step, message);
    console.error(`[chained] Run ${runId} — Step ${step} failed:`, error);
    return NextResponse.json({ runId, step, error: message }, { status: 500 });
  }
}
