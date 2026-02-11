export const config = {
  jobDurationMs: Number(process.env.NEXT_PUBLIC_JOB_DURATION_MS) || 10_000,
  simulatedTimeoutMs:
    Number(process.env.NEXT_PUBLIC_SIMULATED_TIMEOUT_MS) || 39_000,
  raceTimeoutMs: Number(process.env.NEXT_PUBLIC_RACE_TIMEOUT_MS) || 38_000,
  totalSteps: 4,
} as const;
