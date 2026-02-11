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

export type PersistedRunStatus = 'pending' | 'ongoing' | 'completed' | 'failed';

export type PersistedRunScenario = 'chained' | 'sequential' | 'race';

export type PersistedRunStep = {
  step: number;
  status: PersistedRunStatus;
  durationMs: number | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type PersistedRun = {
  id: string;
  scenario: PersistedRunScenario;
  status: PersistedRunStatus;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  steps: PersistedRunStep[];
};
