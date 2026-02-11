'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScenarioCard } from '@/components/scenario-card';
import {
  TOTAL_STEPS,
  CHAINED_JOB_DURATION_SECONDS,
  CHAINED_MAX_DURATION,
  SEQUENTIAL_JOB_DURATION_SECONDS,
  SEQUENTIAL_MAX_DURATION,
  RACE_TIMEOUT_SECONDS,
} from '@/lib/constants';
import { type Job, type ScenarioState } from '@/lib/types';

const initialJobs = (): Job[] =>
  Array.from({ length: TOTAL_STEPS }, (_, index) => ({
    step: index + 1,
    status: 'idle' as const,
  }));

const initialState = (): ScenarioState => ({
  status: 'idle',
  jobs: initialJobs(),
  elapsed: 0,
});

const useElapsedTimer = () => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const start = useCallback((onTick: (elapsed: number) => void) => {
    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      onTick(Date.now() - startRef.current);
    }, 100);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return { start, stop };
};

const readNDJSONStream = async (
  response: Response,
  onEvent: (event: Record<string, unknown>) => void
) => {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        onEvent(JSON.parse(line));
      }
    }
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer));
  }
};

export function DemoDashboard() {
  const [chainedState, setChainedState] =
    useState<ScenarioState>(initialState());
  const [sequentialState, setSequentialState] =
    useState<ScenarioState>(initialState());
  const [raceState, setRaceState] = useState<ScenarioState>(initialState());

  const chainedTimer = useElapsedTimer();
  const sequentialTimer = useElapsedTimer();
  const raceTimer = useElapsedTimer();

  const runChained = useCallback(async () => {
    setChainedState({ status: 'running', jobs: initialJobs(), elapsed: 0 });

    const jobDurationMs = CHAINED_JOB_DURATION_SECONDS * 1000;
    const totalJobs = TOTAL_STEPS;

    chainedTimer.start((elapsed) => {
      setChainedState((prev) => {
        const currentStep = Math.min(
          Math.floor(elapsed / jobDurationMs) + 1,
          totalJobs
        );

        const updatedJobs = prev.jobs.map((job) => {
          if (job.step < currentStep) {
            return { ...job, status: 'complete' as const, durationMs: jobDurationMs };
          } else if (job.step === currentStep) {
            return { ...job, status: 'running' as const };
          }
          return job;
        });

        return { ...prev, elapsed, jobs: updatedJobs };
      });
    });

    try {
      const res = await fetch('/api/chained/1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`Step 1 failed: ${res.statusText}`);
      }

      // Wait for estimated total duration, then mark complete
      const totalDurationMs = jobDurationMs * totalJobs;
      await new Promise((resolve) => setTimeout(resolve, totalDurationMs));

      chainedTimer.stop();
      setChainedState((prev) => ({
        ...prev,
        status: 'complete',
        jobs: prev.jobs.map((job) => ({
          ...job,
          status: 'complete',
          durationMs: jobDurationMs,
        })),
      }));
    } catch (error) {
      chainedTimer.stop();
      setChainedState((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        jobs: prev.jobs.map((job) =>
          job.status === 'running' ? { ...job, status: 'failed' } : job
        ),
      }));
    }
  }, [chainedTimer]);

  const runSequential = useCallback(async () => {
    setSequentialState({
      status: 'running',
      jobs: initialJobs(),
      elapsed: 0,
    });
    sequentialTimer.start((elapsed) =>
      setSequentialState((prev) => ({ ...prev, elapsed }))
    );

    try {
      const res = await fetch('/api/sequential', { method: 'POST' });

      await readNDJSONStream(res, (event) => {
        const type = event.type as string;

        if (type === 'start') {
          setSequentialState((prev) => ({
            ...prev,
            jobs: prev.jobs.map((j) =>
              j.step === event.step ? { ...j, status: 'running' } : j
            ),
          }));
        } else if (type === 'complete') {
          setSequentialState((prev) => ({
            ...prev,
            jobs: prev.jobs.map((j) =>
              j.step === event.step
                ? {
                    ...j,
                    status: 'complete',
                    durationMs: event.durationMs as number,
                  }
                : j
            ),
          }));
        } else if (type === 'done') {
          sequentialTimer.stop();
          setSequentialState((prev) => ({ ...prev, status: 'complete' }));
        } else if (type === 'timeout') {
          sequentialTimer.stop();
          setSequentialState((prev) => ({
            ...prev,
            status: 'error',
            error: event.message as string,
            jobs: prev.jobs.map((j) =>
              j.status === 'running' ? { ...j, status: 'timeout' } : j
            ),
          }));
        } else if (type === 'error') {
          sequentialTimer.stop();
          setSequentialState((prev) => ({
            ...prev,
            status: 'error',
            error: event.message as string,
            jobs: prev.jobs.map((j) =>
              j.status === 'running' ? { ...j, status: 'failed' } : j
            ),
          }));
        }
      });
    } catch (error) {
      sequentialTimer.stop();
      setSequentialState((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        jobs: prev.jobs.map((j) =>
          j.status === 'running' ? { ...j, status: 'failed' } : j
        ),
      }));
    }
  }, [sequentialTimer]);

  const runRace = useCallback(async () => {
    setRaceState({ status: 'running', jobs: initialJobs(), elapsed: 0 });
    raceTimer.start((elapsed) =>
      setRaceState((prev) => ({ ...prev, elapsed }))
    );

    try {
      const res = await fetch('/api/sequential-with-race', {
        method: 'POST',
      });

      await readNDJSONStream(res, (event) => {
        const type = event.type as string;

        if (type === 'start') {
          setRaceState((prev) => ({
            ...prev,
            jobs: prev.jobs.map((j) =>
              j.step === event.step ? { ...j, status: 'running' } : j
            ),
          }));
        } else if (type === 'complete') {
          setRaceState((prev) => ({
            ...prev,
            jobs: prev.jobs.map((j) =>
              j.step === event.step
                ? {
                    ...j,
                    status: 'complete',
                    durationMs: event.durationMs as number,
                  }
                : j
            ),
          }));
        } else if (type === 'done') {
          raceTimer.stop();
          setRaceState((prev) => ({ ...prev, status: 'complete' }));
        } else if (type === 'race_timeout') {
          raceTimer.stop();
          setRaceState((prev) => ({
            ...prev,
            status: 'error',
            error: event.message as string,
            jobs: prev.jobs.map((j) =>
              j.status === 'running' ? { ...j, status: 'timeout' } : j
            ),
          }));
        } else if (type === 'error') {
          raceTimer.stop();
          setRaceState((prev) => ({
            ...prev,
            status: 'error',
            error: event.message as string,
            jobs: prev.jobs.map((j) =>
              j.status === 'running' ? { ...j, status: 'failed' } : j
            ),
          }));
        }
      });
    } catch (error) {
      raceTimer.stop();
      setRaceState((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        jobs: prev.jobs.map((j) =>
          j.status === 'running' ? { ...j, status: 'failed' } : j
        ),
      }));
    }
  }, [raceTimer]);

  const chainedTotalTime = CHAINED_JOB_DURATION_SECONDS * TOTAL_STEPS;
  const sequentialTotalTime = SEQUENTIAL_JOB_DURATION_SECONDS * TOTAL_STEPS;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Chained API Routes Demo
        </h1>
        <p className="text-muted-foreground mt-2">
          Understanding long-running API route patterns in Next.js / Vercel
        </p>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-4 rounded-md border p-4 font-mono text-xs">
        <span>
          Chained: {TOTAL_STEPS} jobs × {CHAINED_JOB_DURATION_SECONDS}s ={' '}
          {chainedTotalTime}s (maxDuration={CHAINED_MAX_DURATION}s per step)
        </span>
        <span>
          Sequential: {TOTAL_STEPS} jobs × {SEQUENTIAL_JOB_DURATION_SECONDS}s ={' '}
          {sequentialTotalTime}s (maxDuration={SEQUENTIAL_MAX_DURATION}s)
        </span>
        <span>Race timeout: {RACE_TIMEOUT_SECONDS}s</span>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <ScenarioCard
          title="1. Chained with after()"
          description={`${TOTAL_STEPS} routes chained server-side via after(). Each has maxDuration=${CHAINED_MAX_DURATION}s.`}
          details={`Client calls /api/chained/1 only. Each step runs a ${CHAINED_JOB_DURATION_SECONDS}s job, responds, then after() triggers the next step. Total work is ${chainedTotalTime}s but split across ${TOTAL_STEPS} separate function invocations.`}
          expectedOutcome={`All ${TOTAL_STEPS} jobs complete in ~${chainedTotalTime}s.`}
          onRun={runChained}
          state={chainedState}
        />

        <ScenarioCard
          title="2. Single Route (Timeout)"
          description={`1 route runs all ${TOTAL_STEPS} jobs. maxDuration=${SEQUENTIAL_MAX_DURATION}s.`}
          details={`All ${TOTAL_STEPS} jobs run sequentially in one route (${SEQUENTIAL_JOB_DURATION_SECONDS}s each = ${sequentialTotalTime}s total). Vercel kills the function at ${SEQUENTIAL_MAX_DURATION}s.`}
          expectedOutcome={`Killed by Vercel at ~${SEQUENTIAL_MAX_DURATION}s with incomplete jobs.`}
          onRun={runSequential}
          state={sequentialState}
        />

        <ScenarioCard
          title="3. Promise.race (Graceful)"
          description={`Same as #2 but Promise.race aborts at ${RACE_TIMEOUT_SECONDS}s.`}
          details={`Each job races against a global ${RACE_TIMEOUT_SECONDS}s timer. When the timer wins, the route returns a clean response instead of being killed by Vercel.`}
          expectedOutcome={`Graceful timeout at ~${RACE_TIMEOUT_SECONDS}s with partial results.`}
          onRun={runRace}
          state={raceState}
        />
      </div>
    </div>
  );
}
