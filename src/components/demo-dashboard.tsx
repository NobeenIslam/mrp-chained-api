'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type JobStatus = 'idle' | 'running' | 'complete' | 'failed' | 'timeout';

type Job = {
  step: number;
  status: JobStatus;
  duration?: number;
};

type ScenarioStatus = 'idle' | 'running' | 'complete' | 'error';

type ScenarioState = {
  status: ScenarioStatus;
  jobs: Job[];
  elapsed: number;
  error?: string;
};

const TOTAL_STEPS = 4;

function initialJobs(): Job[] {
  return Array.from({ length: TOTAL_STEPS }, (_, i) => ({
    step: i + 1,
    status: 'idle' as const,
  }));
}

function initialState(): ScenarioState {
  return { status: 'idle', jobs: initialJobs(), elapsed: 0 };
}

function StatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case 'idle':
      return (
        <span className="text-muted-foreground inline-block size-5 text-center">
          -
        </span>
      );
    case 'running':
      return (
        <span className="inline-block size-5 animate-spin text-center text-blue-500">
          &#9696;
        </span>
      );
    case 'complete':
      return (
        <span className="inline-block size-5 text-center text-green-500">
          &#10003;
        </span>
      );
    case 'failed':
      return (
        <span className="inline-block size-5 text-center text-red-500">
          &#10007;
        </span>
      );
    case 'timeout':
      return (
        <span className="inline-block size-5 text-center text-amber-500">
          &#9888;
        </span>
      );
  }
}

function StatusBadge({ status }: { status: ScenarioStatus }) {
  switch (status) {
    case 'idle':
      return <Badge variant="outline">Idle</Badge>;
    case 'running':
      return <Badge variant="secondary">Running</Badge>;
    case 'complete':
      return <Badge className="bg-green-600">Complete</Badge>;
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
  }
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function JobList({ jobs }: { jobs: Job[] }) {
  return (
    <ul className="space-y-2">
      {jobs.map((job) => (
        <li key={job.step} className="flex items-center gap-3 text-sm">
          <StatusIcon status={job.status} />
          <span className="font-mono">Job {job.step}</span>
          {job.duration !== undefined && (
            <span className="text-muted-foreground ml-auto">
              {formatMs(job.duration)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function useElapsedTimer() {
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
}

function ScenarioCard({
  title,
  description,
  details,
  expectedOutcome,
  onRun,
  state,
}: {
  title: string;
  description: string;
  details: string;
  expectedOutcome: string;
  onRun: () => void;
  state: ScenarioState;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>{title}</CardTitle>
          <StatusBadge status={state.status} />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-xs">{details}</p>
        <div className="rounded-md border p-3">
          <JobList jobs={state.jobs} />
        </div>
        {state.elapsed > 0 && (
          <p className="text-muted-foreground text-xs">
            Elapsed: {formatMs(state.elapsed)}
          </p>
        )}
        {state.error && (
          <p className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}
        <p className="text-muted-foreground text-xs italic">
          Expected: {expectedOutcome}
        </p>
        <Button
          onClick={onRun}
          disabled={state.status === 'running'}
          className="w-full"
        >
          {state.status === 'running' ? 'Running...' : 'Run'}
        </Button>
      </CardContent>
    </Card>
  );
}

async function readNDJSONStream(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void
) {
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
}

export function DemoDashboard() {
  const [chainedState, setChainedState] = useState<ScenarioState>(
    initialState()
  );
  const [sequentialState, setSequentialState] = useState<ScenarioState>(
    initialState()
  );
  const [raceState, setRaceState] = useState<ScenarioState>(initialState());

  const chainedTimer = useElapsedTimer();
  const sequentialTimer = useElapsedTimer();
  const raceTimer = useElapsedTimer();

  const runChained = useCallback(async () => {
    setChainedState({ status: 'running', jobs: initialJobs(), elapsed: 0 });
    chainedTimer.start((elapsed) =>
      setChainedState((prev) => ({ ...prev, elapsed }))
    );

    try {
      for (let step = 1; step <= TOTAL_STEPS; step++) {
        setChainedState((prev) => ({
          ...prev,
          jobs: prev.jobs.map((j) =>
            j.step === step ? { ...j, status: 'running' } : j
          ),
        }));

        const res = await fetch(`/api/chained/${step}`, { method: 'POST' });

        if (!res.ok) {
          throw new Error(`Step ${step} failed: ${res.statusText}`);
        }

        const result = await res.json();

        setChainedState((prev) => ({
          ...prev,
          jobs: prev.jobs.map((j) =>
            j.step === step
              ? { ...j, status: 'complete', duration: result.duration }
              : j
          ),
        }));
      }

      chainedTimer.stop();
      setChainedState((prev) => ({ ...prev, status: 'complete' }));
    } catch (error) {
      chainedTimer.stop();
      setChainedState((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        jobs: prev.jobs.map((j) =>
          j.status === 'running' ? { ...j, status: 'failed' } : j
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
                    duration: event.duration as number,
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
      const res = await fetch('/api/sequential-with-race', { method: 'POST' });

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
                    duration: event.duration as number,
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

  const jobDuration = process.env.NEXT_PUBLIC_JOB_DURATION_MS || '10000';
  const simulatedTimeout =
    process.env.NEXT_PUBLIC_SIMULATED_TIMEOUT_MS || '39000';
  const raceTimeout = process.env.NEXT_PUBLIC_RACE_TIMEOUT_MS || '38000';

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
        <span>JOB_DURATION: {formatMs(Number(jobDuration))}</span>
        <span>SIMULATED_TIMEOUT: {formatMs(Number(simulatedTimeout))}</span>
        <span>RACE_TIMEOUT: {formatMs(Number(raceTimeout))}</span>
        <span>
          TOTAL_WORK: {formatMs(Number(jobDuration) * TOTAL_STEPS)}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <ScenarioCard
          title="1. Client-Side Chaining"
          description="4 separate API routes called sequentially by the client. Each has maxDuration=15s."
          details={`The client calls /api/chained/1, waits for the response, then calls /api/chained/2, and so on. Each route only runs for ~${formatMs(Number(jobDuration))} — well within its maxDuration. Uses after() for post-response logging (check terminal).`}
          expectedOutcome={`All 4 jobs complete in ~${formatMs(Number(jobDuration) * TOTAL_STEPS)}`}
          onRun={runChained}
          state={chainedState}
        />

        <ScenarioCard
          title="2. Single Route (Timeout)"
          description={`1 API route runs all 4 jobs. maxDuration=${Math.round(Number(simulatedTimeout) / 1000)}s — not enough.`}
          details={`All 4 jobs run sequentially in a single route, streaming progress via NDJSON. Total work is ~${formatMs(Number(jobDuration) * TOTAL_STEPS)} but maxDuration is only ${formatMs(Number(simulatedTimeout))}. Simulates Vercel killing the route.`}
          expectedOutcome={`Timeout at ~${formatMs(Number(simulatedTimeout))} with incomplete jobs`}
          onRun={runSequential}
          state={sequentialState}
        />

        <ScenarioCard
          title="3. Promise.race (Graceful)"
          description={`Same as #2 but uses Promise.race with a ${formatMs(Number(raceTimeout))} timeout.`}
          details={`Races each job against a global timeout timer. When the timer fires before a job completes, the route returns a clean error response instead of being killed by Vercel. You control the failure mode.`}
          expectedOutcome={`Graceful timeout at ~${formatMs(Number(raceTimeout))} with partial results`}
          onRun={runRace}
          state={raceState}
        />
      </div>
    </div>
  );
}
