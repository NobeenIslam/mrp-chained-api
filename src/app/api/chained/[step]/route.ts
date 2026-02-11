import { after, NextResponse } from 'next/server';
import { simulateJob } from '@/lib/jobs';
import { TOTAL_STEPS, CHAINED_JOB_DURATION_SECONDS } from '@/lib/constants';

// maxDuration must be a static literal for Vercel's build-time analysis
export const maxDuration = 6;

const VALID_STEPS = new Set([1, 2, 3, 4]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ step: string }> }
) {
  const { step: stepParam } = await params;
  const step = Number(stepParam);

  if (!VALID_STEPS.has(step)) {
    return NextResponse.json(
      { error: `Invalid step: ${stepParam}. Must be 1-${TOTAL_STEPS}.` },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const runId: string = body.runId ?? crypto.randomUUID();

  console.log(
    `[chained] Run ${runId} — Step ${step} starting (${CHAINED_JOB_DURATION_SECONDS}s)...`
  );

  try {
    const result = await simulateJob(step, CHAINED_JOB_DURATION_SECONDS);
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
          }
        } catch (err) {
          console.error(
            `[after] Run ${runId} — Failed to trigger step ${nextStep}:`,
            err
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
    console.error(`[chained] Run ${runId} — Step ${step} failed:`, error);
    return NextResponse.json({ runId, step, error: message }, { status: 500 });
  }
}
