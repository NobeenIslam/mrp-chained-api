export type JobStatus = 'idle' | 'running' | 'complete' | 'failed' | 'timeout';

export type Job = {
  step: number;
  status: JobStatus;
  durationMs?: number;
};

export type ScenarioStatus = 'idle' | 'running' | 'complete' | 'error';

export type ScenarioState = {
  status: ScenarioStatus;
  jobs: Job[];
  elapsed: number;
  error?: string;
};

export type ChainRunResponse = {
  id: string;
  status: 'running' | 'complete' | 'failed';
  startedAt: number;
  completedAt?: number;
  jobs: {
    step: number;
    status: 'pending' | 'running' | 'complete' | 'failed';
    durationMs?: number;
    error?: string;
  }[];
};
