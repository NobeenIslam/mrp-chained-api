import { after, NextResponse } from 'next/server';
import { simulateJob } from '@/lib/jobs';
import {
  createRun,
  markJobRunning,
  markJobComplete,
  markJobFailed,
} from '@/lib/chain-store';
import {
  TOTAL_STEPS,
  CHAINED_JOB_DURATION_SECONDS,
} from '@/lib/constants';

// maxDuration must be a static literal for Vercel's build-time analysis
export const maxDuration = 15;

const VALID_STEPS = new Set([1, 2, 3, 4]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ step: string }> }
) {
  const { step: stepParam } = await params;
  const step = Number(stepParam);

  if (!VALID_STEPS.has(step)) {
    return NextResponse.json(
      {
        error: `Invalid step: ${stepParam}. Must be 1-${TOTAL_STEPS}.`,
      },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const runId: string = body.runId ?? crypto.randomUUID();

  if (step === 1) {
    createRun(runId, TOTAL_STEPS);
  }

  const durationSeconds = CHAINED_JOB_DURATION_SECONDS;

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

    if (nextStep <= TOTAL_STEPS) {
      const origin = new URL(request.url).origin;
      const nextUrl = `${origin}/api/chained/${nextStep}`;

      after(async () => {
        console.log(
          `[after] Run ${runId} — Triggering step ${nextStep} → ${nextUrl}`
        );
        try {
          const res = await fetch(nextUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId }),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error(
              `[after] Run ${runId} — Step ${nextStep} returned ${res.status}: ${text}`
            );
            markJobFailed(
              runId,
              nextStep,
              `Step ${nextStep} returned HTTP ${res.status}`
            );
          }
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
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    markJobFailed(runId, step, message);
    console.error(
      `[chained] Run ${runId} — Step ${step} failed:`,
      error
    );
    return NextResponse.json(
      { runId, step, error: message },
      { status: 500 }
    );
  }
}
