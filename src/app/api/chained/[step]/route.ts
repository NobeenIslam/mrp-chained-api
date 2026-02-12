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

// --- Helpers ---

async function triggerStep(
  origin: string,
  runId: string,
  nextStep: number
): Promise<void> {
  const nextUrl = `${origin}/api/chained/${nextStep}`;
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
}

async function pingRoute(
  origin: string,
  source: string
): Promise<void> {
  const pingUrl = `${origin}/api/ping`;
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

  // =================================================================
  // Step 1: Synchronous — browser needs the result back
  // =================================================================
  if (step === 1) {
    console.log(
      `[chained] Run ${runId} — Step 1 starting (${CHAINED_JOB_DURATION_SECONDS}s)...`
    );

    try {
      await markStepOngoing(runId, step);
      const result = await simulateJob(step, CHAINED_JOB_DURATION_SECONDS);
      await markStepComplete(runId, step, result.durationMs);

      console.log(
        `[chained] Run ${runId} — Step 1 complete (${result.durationMs}ms)`
      );

      // Step 2 returns 202 instantly, so this after() resolves fast
      after(async () => {
        await triggerStep(origin, runId, 2);
      });

      const latestRun = await getRun(runId);
      return NextResponse.json({
        runId,
        ...result,
        run: latestRun ? formatPersistedRun(latestRun) : null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`[chained] Run ${runId} — Step 1 failed:`, error);
      await markRunFailed(runId, message, step).catch((persistError) => {
        console.error(
          `[chained] Run ${runId} — Failed to persist error:`,
          persistError
        );
      });
      return NextResponse.json(
        { runId, step, error: message },
        { status: 500 }
      );
    }
  }

  // =================================================================
  // Steps 2-4: 202 pattern — return immediately, work in after()
  // =================================================================

  await markStepOngoing(runId, step);

  console.log(
    `[chained] Run ${runId} — Step ${step} accepted, work deferred to after()`
  );

  // -----------------------------------------------------------------
  // Step 2 (TEST 1): Two separate after() registrations
  //   after #1: do work + trigger step 3
  //   after #2: ping a different route
  // -----------------------------------------------------------------
  if (step === 2) {
    console.log(
      `[chained] Run ${runId} — Step 2: registering TWO separate after() callbacks`
    );

    after(async () => {
      console.log(
        `[after] Run ${runId} — Step 2 [callback #1] starting work (${CHAINED_JOB_DURATION_SECONDS}s)...`
      );
      try {
        const result = await simulateJob(
          step,
          CHAINED_JOB_DURATION_SECONDS
        );
        await markStepComplete(runId, step, result.durationMs);
        console.log(
          `[after] Run ${runId} — Step 2 [callback #1] complete (${result.durationMs}ms), triggering step 3`
        );
        await triggerStep(origin, runId, 3);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `[after] Run ${runId} — Step 2 [callback #1] failed:`,
          error
        );
        await markRunFailed(runId, message, step).catch(() => {});
      }
    });

    after(async () => {
      console.log(
        `[after] Run ${runId} — Step 2 [callback #2] pinging separate route`
      );
      await pingRoute(
        origin,
        `step-2-separate-after (run ${runId})`
      );
    });
  }

  // -----------------------------------------------------------------
  // Step 3 (TEST 2): One after() with two fetch calls inside
  //   Single after() does work, then fires step 4 + ping in parallel
  // -----------------------------------------------------------------
  if (step === 3) {
    after(async () => {
      console.log(
        `[after] Run ${runId} — Step 3 starting work (${CHAINED_JOB_DURATION_SECONDS}s)...`
      );
      try {
        const result = await simulateJob(
          step,
          CHAINED_JOB_DURATION_SECONDS
        );
        await markStepComplete(runId, step, result.durationMs);
        console.log(
          `[after] Run ${runId} — Step 3 complete (${result.durationMs}ms), firing TWO fetches in parallel`
        );

        const [chainRes, pingRes] = await Promise.all([
          fetch(`${origin}/api/chained/4`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId }),
          }).catch((err) => {
            console.error(
              `[after] Run ${runId} — Step 4 trigger failed:`,
              err
            );
            return null;
          }),
          fetch(`${origin}/api/ping`, {
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
            `[after] Run ${runId} — Step 4 returned ${chainRes.status}: ${text}`
          );
          await markRunFailed(
            runId,
            `Step 4 failed to start (HTTP ${chainRes.status}).`,
            4
          ).catch(() => {});
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `[after] Run ${runId} — Step 3 failed:`,
          error
        );
        await markRunFailed(runId, message, step).catch(() => {});
      }
    });
  }

  // -----------------------------------------------------------------
  // Step 4 (TEST 3): Promise.race — long job vs timeout
  //   Job intentionally exceeds maxDuration; race timeout bails early
  // -----------------------------------------------------------------
  if (step === TOTAL_STEPS) {
    after(async () => {
      const raceTimeoutMs = CHAINED_STEP4_RACE_TIMEOUT_SECONDS * 1000;

      console.log(
        `[after] Run ${runId} — Step ${step} using Promise.race ` +
          `(job=${CHAINED_STEP4_JOB_DURATION_SECONDS}s, timeout=${CHAINED_STEP4_RACE_TIMEOUT_SECONDS}s, maxDuration=${CHAINED_MAX_DURATION}s)`
      );

      try {
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
          console.log(`[after] Run ${runId} — ${message}`);
          await markRunFailed(runId, message, step).catch(() => {});
          return;
        }

        // Race won by the job (shouldn't happen with current durations)
        await markStepComplete(runId, step, raceResult.durationMs);
        await markRunComplete(runId);
        console.log(
          `[after] Run ${runId} — Step ${step} completed before race timeout (${raceResult.durationMs}ms)`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `[after] Run ${runId} — Step ${step} failed:`,
          error
        );
        await markRunFailed(runId, message, step).catch(() => {});
      }
    });
  }

  // Return 202 immediately — caller's after() fetch resolves fast
  return NextResponse.json(
    { runId, step, status: 'accepted' },
    { status: 202 }
  );
}
