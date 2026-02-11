export type JobState = {
  step: number;
  status: 'pending' | 'running' | 'complete' | 'failed';
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
};

export type ChainRun = {
  id: string;
  status: 'running' | 'complete' | 'failed';
  startedAt: number;
  completedAt?: number;
  jobs: JobState[];
};

const store = new Map<string, ChainRun>();

export function createRun(id: string, totalSteps: number): ChainRun {
  const run: ChainRun = {
    id,
    status: 'running',
    startedAt: Date.now(),
    jobs: Array.from({ length: totalSteps }, (_, i) => ({
      step: i + 1,
      status: 'pending' as const,
    })),
  };
  store.set(id, run);
  return run;
}

export function getRun(id: string): ChainRun | undefined {
  return store.get(id);
}

export function markJobRunning(runId: string, step: number): void {
  const run = store.get(runId);
  if (!run) return;

  const job = run.jobs.find((j) => j.step === step);
  if (!job) return;

  job.status = 'running';
  job.startedAt = Date.now();
}

export function markJobComplete(
  runId: string,
  step: number,
  durationMs: number
): void {
  const run = store.get(runId);
  if (!run) return;

  const job = run.jobs.find((j) => j.step === step);
  if (!job) return;

  job.status = 'complete';
  job.completedAt = Date.now();
  job.durationMs = durationMs;

  const allComplete = run.jobs.every((j) => j.status === 'complete');
  if (allComplete) {
    run.status = 'complete';
    run.completedAt = Date.now();
  }
}

export function markJobFailed(
  runId: string,
  step: number,
  error: string
): void {
  const run = store.get(runId);
  if (!run) return;

  const job = run.jobs.find((j) => j.step === step);
  if (!job) return;

  job.status = 'failed';
  job.error = error;

  run.status = 'failed';
  run.completedAt = Date.now();
}
