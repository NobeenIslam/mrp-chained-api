// Shared constants for API routes and frontend
// Note: maxDuration exports in API routes must remain static literals for Vercel

export const TOTAL_STEPS = 4;

// Chained route: 4 jobs × 5s = 20s total across 4 invocations (maxDuration=15s each)
export const CHAINED_JOB_DURATION_SECONDS = 4;
export const CHAINED_MAX_DURATION = 6;

// Sequential route: 4 jobs × 6s = 24s total in one invocation (maxDuration=20s)
// Vercel will kill this before completion
export const SEQUENTIAL_JOB_DURATION_SECONDS = 3;
export const SEQUENTIAL_MAX_DURATION = 10;

// Race route: Same as sequential but with graceful timeout at 15s
export const RACE_TIMEOUT_SECONDS = 5;
