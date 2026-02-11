export const config = {
  chained: {
    maxDuration: Number(process.env.NEXT_CHAINED_MAX_DURATION) || 15,
    jobDurations: [
      Number(process.env.NEXT_CHAINED_JOB_ONE_DURATION) || 10,
      Number(process.env.NEXT_CHAINED_JOB_TWO_DURATION) || 10,
      Number(process.env.NEXT_CHAINED_JOB_THREE_DURATION) || 10,
      Number(process.env.NEXT_CHAINED_JOB_FOUR_DURATION) || 10,
    ] as readonly number[],
  },
  sequential: {
    maxDuration:
      Number(process.env.NEXT_PUBLIC_SEQUENTIAL_MAX_DURATION) || 40,
    raceTimeout:
      Number(process.env.NEXT_PUBLIC_SEQUENTUAL_RACE) || 30,
  },
  totalSteps: 4,
} as const;
