import { after, NextResponse } from 'next/server';
import { JobScenario, JobStatus } from '@prisma/client';
import { simulateJob } from '@/lib/jobs';
import { TOTAL_STEPS, CHAINED_JOB_DURATION_SECONDS } from '@/lib/constants';
import {
  createRun,
  formatPersistedRun,
  getOrCreateRun,
  getRun,
  markRunComplete,
  markRunFailed,
  markStepComplete,
  markStepOngoing,
} from '@/lib/run-store';

// maxDuration must be a static literal for Vercel's build-time analysis
export const maxDuration = 6;

const VALID_STEPS = new Set(
  Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1)
);

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
  const requestedRunId =
    typeof body.runId === 'string' ? body.runId : undefined;
  const runId = requestedRunId ?? crypto.randomUUID();

  const run =
    step === 1 && !requestedRunId
      ? await createRun(JobScenario.CHAINED, runId)
      : await getOrCreateRun(runId, JobScenario.CHAINED);

  if (run.scenario !== JobScenario.CHAINED) {
    return NextResponse.json(
      { error: `Run ${runId} belongs to a different scenario.` },
      { status: 400 }
    );
  }

  if (run.status === JobStatus.FAILED || run.status === JobStatus.COMPLETED) {
    return NextResponse.json({
      runId,
      step,
      status: run.status === JobStatus.FAILED ? 'aborted' : 'already_done',
      message:
        run.error ??
        `Run is already ${run.status.toLowerCase()} and cannot continue.`,
      run: formatPersistedRun(run),
    });
  }

  const existingStep = run.steps.find((runStep) => runStep.step === step);
  if (!existingStep) {
    return NextResponse.json(
      { error: `Run ${runId} does not contain step ${step}.` },
      { status: 400 }
    );
  }

  if (existingStep.status === JobStatus.COMPLETED) {
    const latestRun = await getRun(runId);
    return NextResponse.json({
      runId,
      step,
      status: 'already_completed',
      run: latestRun ? formatPersistedRun(latestRun) : null,
    });
  }

  console.log(
    `[chained] Run ${runId} — Step ${step} starting (${CHAINED_JOB_DURATION_SECONDS}s)...`
  );

  try {
    const started = await markStepOngoing(runId, step);
    if (!started) {
      const latestRun = await getRun(runId);
      return NextResponse.json({
        runId,
        step,
        status: 'aborted',
        message:
          latestRun?.error ?? 'Run was stopped before this step started.',
        run: latestRun ? formatPersistedRun(latestRun) : null,
      });
    }

    const result = await simulateJob(step, CHAINED_JOB_DURATION_SECONDS);

    const latestBeforeComplete = await getRun(runId);
    if (latestBeforeComplete?.status === JobStatus.FAILED) {
      return NextResponse.json({
        runId,
        step,
        status: 'aborted',
        message:
          latestBeforeComplete.error ??
          'Run was stopped while this step was executing.',
        run: formatPersistedRun(latestBeforeComplete),
      });
    }

    await markStepComplete(runId, step, result.durationMs);

    console.log(
      `[chained] Run ${runId} — Step ${step} complete (${result.durationMs}ms)`
    );

    const nextStep = step + 1;
    const latestRun = await getRun(runId);

    if (latestRun?.status === JobStatus.FAILED) {
      return NextResponse.json({
        runId,
        step,
        status: 'aborted',
        message:
          latestRun.error ??
          'Run was stopped after this step completed. Next step will not run.',
        run: formatPersistedRun(latestRun),
      });
    }

    if (nextStep <= TOTAL_STEPS) {
      const origin = new URL(request.url).origin;
      const nextUrl = `${origin}/api/chained/${nextStep}`;

      after(async () => {
        const runSnapshot = await getRun(runId);
        if (runSnapshot?.status === JobStatus.FAILED) {
          console.log(
            `[after] Run ${runId} — Step ${nextStep} skipped because run is failed.`
          );
          return;
        }

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

            await markRunFailed(
              runId,
              `Step ${nextStep} failed to start (HTTP ${res.status}).`,
              nextStep
            ).catch((err) => {
              console.error(
                `[after] Run ${runId} — Failed to persist trigger error:`,
                err
              );
            });
          }
        } catch (err) {
          console.error(
            `[after] Run ${runId} — Failed to trigger step ${nextStep}:`,
            err
          );
          await markRunFailed(
            runId,
            `Step ${nextStep} failed to start after previous completion.`,
            nextStep
          ).catch((persistError) => {
            console.error(
              `[after] Run ${runId} — Failed to persist trigger failure:`,
              persistError
            );
          });
        }
      });
    } else {
      await markRunComplete(runId);
      after(() => {
        console.log(
          `[after] Run ${runId} — All steps complete at ${new Date().toISOString()}`
        );
      });
    }

    const finalRun = await getRun(runId);
    return NextResponse.json({
      runId,
      ...result,
      run: finalRun ? formatPersistedRun(finalRun) : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[chained] Run ${runId} — Step ${step} failed:`, error);

    await markRunFailed(runId, message, step).catch((persistError) => {
      console.error(
        `[chained] Run ${runId} — Failed to persist error:`,
        persistError
      );
    });

    return NextResponse.json({ runId, step, error: message }, { status: 500 });
  }
}
