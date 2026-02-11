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
import {
  type Job,
  type PersistedRun,
  type PersistedRunScenario,
  type PersistedRunStatus,
  type ScenarioState,
} from '@/lib/types';

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

const initialRunHistory: Record<PersistedRunScenario, PersistedRun[]> = {
  chained: [],
  sequential: [],
  race: [],
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

const mapStepStatusToJobStatus = (
  status: PersistedRunStatus,
  error: string | null
): Job['status'] => {
  switch (status) {
    case 'pending':
      return 'idle';
    case 'ongoing':
      return 'running';
    case 'completed':
      return 'complete';
    case 'failed':
      return error?.toLowerCase().includes('timeout') ? 'timeout' : 'failed';
  }
};

const mapRunStatusToScenarioStatus = (
  status: PersistedRunStatus
): ScenarioState['status'] => {
  switch (status) {
    case 'pending':
    case 'ongoing':
      return 'running';
    case 'completed':
      return 'complete';
    case 'failed':
      return 'error';
  }
};

const toScenarioState = (run: PersistedRun): ScenarioState => {
  const startedAtMs = new Date(run.startedAt).getTime();
  const endedAtMs = run.completedAt
    ? new Date(run.completedAt).getTime()
    : Date.now();

  return {
    status: mapRunStatusToScenarioStatus(run.status),
    jobs: run.steps.map((step) => ({
      step: step.step,
      status: mapStepStatusToJobStatus(step.status, step.error),
      durationMs: step.durationMs ?? undefined,
    })),
    elapsed: Math.max(endedAtMs - startedAtMs, 0),
    error: run.error ?? undefined,
  };
};

const groupRunsByScenario = (runs: PersistedRun[]) => ({
  chained: runs.filter((run) => run.scenario === 'chained'),
  sequential: runs.filter((run) => run.scenario === 'sequential'),
  race: runs.filter((run) => run.scenario === 'race'),
});

type ActiveRunIds = Partial<Record<PersistedRunScenario, string>>;

export function DemoDashboard() {
  const [chainedState, setChainedState] =
    useState<ScenarioState>(initialState());
  const [sequentialState, setSequentialState] =
    useState<ScenarioState>(initialState());
  const [raceState, setRaceState] = useState<ScenarioState>(initialState());

  const [activeRunIds, setActiveRunIds] = useState<ActiveRunIds>({});
  const [runHistory, setRunHistory] =
    useState<Record<PersistedRunScenario, PersistedRun[]>>(initialRunHistory);
  const activeRunIdsRef = useRef<ActiveRunIds>({});

  const refreshRuns = useCallback(async () => {
    try {
      const response = await fetch('/api/runs?limit=60', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Failed to load runs: ${response.status}`);
      }

      const payload = (await response.json()) as { runs: PersistedRun[] };
      const groupedRuns = groupRunsByScenario(payload.runs);
      setRunHistory(groupedRuns);

      const activeIds = activeRunIdsRef.current;

      const chainedRun = activeIds.chained
        ? groupedRuns.chained.find((run) => run.id === activeIds.chained)
        : groupedRuns.chained[0];
      const sequentialRun = activeIds.sequential
        ? groupedRuns.sequential.find((run) => run.id === activeIds.sequential)
        : groupedRuns.sequential[0];
      const raceRun = activeIds.race
        ? groupedRuns.race.find((run) => run.id === activeIds.race)
        : groupedRuns.race[0];

      setChainedState(
        chainedRun ? toScenarioState(chainedRun) : initialState()
      );
      setSequentialState(
        sequentialRun ? toScenarioState(sequentialRun) : initialState()
      );
      setRaceState(raceRun ? toScenarioState(raceRun) : initialState());

      setActiveRunIds((previous) => {
        const next = { ...previous };
        let changed = false;

        if (
          previous.chained &&
          (!chainedRun ||
            chainedRun.status === 'completed' ||
            chainedRun.status === 'failed')
        ) {
          delete next.chained;
          changed = true;
        }

        if (
          previous.sequential &&
          (!sequentialRun ||
            sequentialRun.status === 'completed' ||
            sequentialRun.status === 'failed')
        ) {
          delete next.sequential;
          changed = true;
        }

        if (
          previous.race &&
          (!raceRun ||
            raceRun.status === 'completed' ||
            raceRun.status === 'failed')
        ) {
          delete next.race;
          changed = true;
        }

        if (!changed) {
          return previous;
        }

        activeRunIdsRef.current = next;
        return next;
      });
    } catch (error) {
      console.error('[dashboard] Failed to refresh runs:', error);
    }
  }, []);

  useEffect(() => {
    activeRunIdsRef.current = activeRunIds;
  }, [activeRunIds]);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  const hasActiveRuns = Boolean(
    activeRunIds.chained || activeRunIds.sequential || activeRunIds.race
  );

  useEffect(() => {
    if (!hasActiveRuns) {
      return;
    }

    const pollId = setInterval(() => {
      void refreshRuns();
    }, 1000);

    return () => {
      clearInterval(pollId);
    };
  }, [hasActiveRuns, refreshRuns]);

  const runChained = useCallback(async () => {
    setChainedState({ status: 'running', jobs: initialJobs(), elapsed: 0 });

    try {
      const response = await fetch('/api/chained/1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as {
        runId?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Step 1 failed (${response.status})`);
      }

      if (payload.runId) {
        setActiveRunIds((previous) => {
          if (previous.chained === payload.runId) {
            return previous;
          }

          const next = {
            ...previous,
            chained: payload.runId,
          };
          activeRunIdsRef.current = next;
          return next;
        });
      }

      await refreshRuns();
    } catch (error) {
      setChainedState((previous) => ({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [refreshRuns]);

  const runSequential = useCallback(async () => {
    setSequentialState({
      status: 'running',
      jobs: initialJobs(),
      elapsed: 0,
    });

    try {
      const response = await fetch('/api/sequential', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Sequential route failed (${response.status})`);
      }

      await readNDJSONStream(response, (event) => {
        if (event.type === 'run_started' && typeof event.runId === 'string') {
          setActiveRunIds((previous) => {
            const runId = event.runId as string;
            if (previous.sequential === runId) {
              return previous;
            }

            const next = {
              ...previous,
              sequential: runId,
            };
            activeRunIdsRef.current = next;
            return next;
          });
        }
      });

      await refreshRuns();
    } catch (error) {
      setSequentialState((previous) => ({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [refreshRuns]);

  const runRace = useCallback(async () => {
    setRaceState({ status: 'running', jobs: initialJobs(), elapsed: 0 });

    try {
      const response = await fetch('/api/sequential-with-race', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Race route failed (${response.status})`);
      }

      await readNDJSONStream(response, (event) => {
        if (event.type === 'run_started' && typeof event.runId === 'string') {
          setActiveRunIds((previous) => {
            const runId = event.runId as string;
            if (previous.race === runId) {
              return previous;
            }

            const next = {
              ...previous,
              race: runId,
            };
            activeRunIdsRef.current = next;
            return next;
          });
        }
      });

      await refreshRuns();
    } catch (error) {
      setRaceState((previous) => ({
        ...previous,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [refreshRuns]);

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
          runId={activeRunIds.chained ?? runHistory.chained[0]?.id}
          runs={runHistory.chained}
        />

        <ScenarioCard
          title="2. Single Route (Timeout)"
          description={`1 route runs all ${TOTAL_STEPS} jobs. maxDuration=${SEQUENTIAL_MAX_DURATION}s.`}
          details={`All ${TOTAL_STEPS} jobs run sequentially in one route (${SEQUENTIAL_JOB_DURATION_SECONDS}s each = ${sequentialTotalTime}s total). Vercel kills the function at ${SEQUENTIAL_MAX_DURATION}s.`}
          expectedOutcome={`Killed by Vercel at ~${SEQUENTIAL_MAX_DURATION}s with incomplete jobs.`}
          onRun={runSequential}
          state={sequentialState}
          runId={activeRunIds.sequential ?? runHistory.sequential[0]?.id}
          runs={runHistory.sequential}
        />

        <ScenarioCard
          title="3. Promise.race (Graceful)"
          description={`Same as #2 but Promise.race aborts at ${RACE_TIMEOUT_SECONDS}s.`}
          details={`Each job races against a global ${RACE_TIMEOUT_SECONDS}s timer. When the timer wins, the route returns a clean response instead of being killed by Vercel.`}
          expectedOutcome={`Graceful timeout at ~${RACE_TIMEOUT_SECONDS}s with partial results.`}
          onRun={runRace}
          state={raceState}
          runId={activeRunIds.race ?? runHistory.race[0]?.id}
          runs={runHistory.race}
        />
      </div>
    </div>
  );
}
