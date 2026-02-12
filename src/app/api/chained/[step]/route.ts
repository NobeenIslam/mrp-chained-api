import { after, NextResponse } from 'next/server';
import { JobScenario, JobStatus } from '@prisma/client';
import { simulateJob } from '@/lib/jobs';
import {
  TOTAL_STEPS,
  CHAINED_JOB_DURATION_SECONDS,
  CHAINED_MAX_DURATION,
  CHAINED_STEP4_JOB_DURATION_SECONDS,
  CHAINED_STEP4_RACE_TIMEOUT_SECONDS,
} from '@/lib/constants';
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
export const maxDuration = 10;

const VALID_STEPS = new Set(
  Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1)
);

// --- Helpers for after() callbacks ---

function triggerNextStep(
  origin: string,
  runId: string,
  nextStep: number
): void {
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
}

function triggerPing(origin: string, source: string): void {
  const pingUrl = `${origin}/api/ping`;

  after(async () => {
    console.log(`[after] Pinging ${pingUrl} from "${source}"`);
    try {
      const res = await fetch(pingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      console.log(`[after] Ping response from "${source}":`, data);
    } catch (err) {
      console.error(`[after] Ping failed from "${source}":`, err);
    }
  });
}

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

  const origin = new URL(request.url).origin;

  console.log(
    `[chained] Run ${runId} — Step ${step} starting (${CHAINED_JOB_DURATION_SECONDS}s)...`
  );

  try {
    await markStepOngoing(runId, step);

    // ---------------------------------------------------------------
    // Step 4 (final): Promise.race — long job vs timeout
    // ---------------------------------------------------------------
    if (step === TOTAL_STEPS) {
      const raceTimeoutMs = CHAINED_STEP4_RACE_TIMEOUT_SECONDS * 1000;

      console.log(
        `[chained] Run ${runId} — Step ${step} using Promise.race ` +
          `(job=${CHAINED_STEP4_JOB_DURATION_SECONDS}s, timeout=${CHAINED_STEP4_RACE_TIMEOUT_SECONDS}s, maxDuration=${CHAINED_MAX_DURATION}s)`
      );

      const raceResult = await Promise.race([
        simulateJob(step, CHAINED_STEP4_JOB_DURATION_SECONDS),
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), raceTimeoutMs)
        ),
      ]);

      if (raceResult === 'timeout') {
        const message =
          `Step ${step} Promise.race timeout after ${CHAINED_STEP4_RACE_TIMEOUT_SECONDS}s ` +
          `— aborted gracefully before maxDuration (${CHAINED_MAX_DURATION}s)`;
        console.log(`[chained] Run ${runId} — ${message}`);

        await markRunFailed(runId, message, step).catch((err) => {
          console.error(
            `[chained] Run ${runId} — Failed to persist race timeout:`,
            err
          );
        });

        after(() => {
          console.log(
            `[after] Run ${runId} — Step ${step} race timeout at ${new Date().toISOString()}`
          );
        });

        const latestRun = await getRun(runId);
        return NextResponse.json({
          runId,
          step,
          status: 'race_timeout',
          message,
          run: latestRun ? formatPersistedRun(latestRun) : null,
        });
      }

      // Race won by the job (shouldn't happen with current durations)
      await markStepComplete(runId, step, raceResult.durationMs);
      await markRunComplete(runId);

      console.log(
        `[chained] Run ${runId} — Step ${step} completed before race timeout (${raceResult.durationMs}ms)`
      );

      after(() => {
        console.log(
          `[after] Run ${runId} — All steps complete at ${new Date().toISOString()}`
        );
      });

      const latestRun = await getRun(runId);
      return NextResponse.json({
        runId,
        ...raceResult,
        run: latestRun ? formatPersistedRun(latestRun) : null,
      });
    }

    // ---------------------------------------------------------------
    // Steps 1-3: Normal job execution
    // ---------------------------------------------------------------
    const result = await simulateJob(step, CHAINED_JOB_DURATION_SECONDS);
    await markStepComplete(runId, step, result.durationMs);

    console.log(
      `[chained] Run ${runId} — Step ${step} complete (${result.durationMs}ms)`
    );

    const nextStep = step + 1;

    // ---------------------------------------------------------------
    // Step 1: Normal — single after() triggers step 2
    // ---------------------------------------------------------------
    if (step === 1) {
      triggerNextStep(origin, runId, nextStep);
    }

    // ---------------------------------------------------------------
    // Step 2: TEST 1 — two separate after() calls
    //   after #1: triggers step 3
    //   after #2: triggers /api/ping
    // ---------------------------------------------------------------
    if (step === 2) {
      console.log(
        `[chained] Run ${runId} — Step 2: registering TWO separate after() callbacks`
      );
      triggerNextStep(origin, runId, nextStep);
      triggerPing(origin, `step-2-separate-after (run ${runId})`);
    }

    // ---------------------------------------------------------------
    // Step 3: TEST 2 — one after() with two fetch calls inside
    //   Single after() fires both step 4 trigger AND /api/ping
    // ---------------------------------------------------------------
    if (step === 3) {
      const nextUrl = `${origin}/api/chained/${nextStep}`;
      const pingUrl = `${origin}/api/ping`;

      after(async () => {
        console.log(
          `[after] Run ${runId} — Step 3: single after() firing TWO fetches`
        );

        const [chainRes, pingRes] = await Promise.all([
          fetch(nextUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId }),
          }).catch((err) => {
            console.error(
              `[after] Run ${runId} — Step ${nextStep} trigger failed:`,
              err
            );
            return null;
          }),
          fetch(pingUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: `step-3-single-after (run ${runId})`,
            }),
          }).catch((err) => {
            console.error(
              `[after] Run ${runId} — Ping from step 3 failed:`,
              err
            );
            return null;
          }),
        ]);

        console.log(
          `[after] Run ${runId} — Step 3 dual fetch results: ` +
            `chain=${chainRes?.status ?? 'failed'}, ping=${pingRes?.status ?? 'failed'}`
        );

        if (chainRes && !chainRes.ok) {
          const text = await chainRes.text().catch(() => '');
          console.error(
            `[after] Run ${runId} — Step ${nextStep} returned ${chainRes.status}: ${text}`
          );
          await markRunFailed(
            runId,
            `Step ${nextStep} failed to start (HTTP ${chainRes.status}).`,
            nextStep
          ).catch((err) => {
            console.error(
              `[after] Run ${runId} — Failed to persist trigger error:`,
              err
            );
          });
        }
      });
    }

    const latestRun = await getRun(runId);
    return NextResponse.json({
      runId,
      ...result,
      run: latestRun ? formatPersistedRun(latestRun) : null,
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
