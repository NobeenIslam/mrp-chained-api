import { JobScenario, JobStatus } from '@/generated/prisma/enums';
import type { Prisma } from '@/generated/prisma/client';
import { TOTAL_STEPS } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import { type PersistedRun } from '@/lib/types';

const statusMap = {
  [JobStatus.PENDING]: 'pending',
  [JobStatus.ONGOING]: 'ongoing',
  [JobStatus.COMPLETED]: 'completed',
  [JobStatus.FAILED]: 'failed',
} as const;

const scenarioMap = {
  [JobScenario.CHAINED]: 'chained',
  [JobScenario.SEQUENTIAL]: 'sequential',
  [JobScenario.RACE]: 'race',
} as const;

const buildInitialSteps = () =>
  Array.from({ length: TOTAL_STEPS }, (_, index) => ({
    step: index + 1,
    status: JobStatus.PENDING,
  }));

const includeSteps = {
  steps: {
    orderBy: {
      step: 'asc',
    },
  },
} satisfies Prisma.JobRunInclude;

type JobRunWithSteps = Prisma.JobRunGetPayload<{
  include: typeof includeSteps;
}>;

export const formatPersistedRun = (run: JobRunWithSteps): PersistedRun => ({
  id: run.id,
  scenario: scenarioMap[run.scenario],
  status: statusMap[run.status],
  error: run.error,
  startedAt: run.startedAt.toISOString(),
  completedAt: run.completedAt?.toISOString() ?? null,
  steps: run.steps.map((step) => ({
    step: step.step,
    status: statusMap[step.status],
    durationMs: step.durationMs,
    error: step.error,
    startedAt: step.startedAt?.toISOString() ?? null,
    completedAt: step.completedAt?.toISOString() ?? null,
  })),
});

export const createRun = async (
  scenario: JobScenario,
  runId?: string
): Promise<JobRunWithSteps> => {
  return prisma.jobRun.create({
    data: {
      ...(runId ? { id: runId } : {}),
      scenario,
      status: JobStatus.PENDING,
      steps: {
        create: buildInitialSteps(),
      },
    },
    include: includeSteps,
  });
};

export const getRun = async (
  runId: string
): Promise<JobRunWithSteps | null> => {
  return prisma.jobRun.findUnique({
    where: { id: runId },
    include: includeSteps,
  });
};

export const getOrCreateRun = async (
  runId: string,
  scenario: JobScenario
): Promise<JobRunWithSteps> => {
  const existing = await getRun(runId);
  if (existing) {
    return existing;
  }

  return createRun(scenario, runId);
};

export const listRuns = async (
  limit = 20,
  scenario?: JobScenario
): Promise<JobRunWithSteps[]> => {
  return prisma.jobRun.findMany({
    ...(scenario ? { where: { scenario } } : {}),
    orderBy: {
      startedAt: 'desc',
    },
    take: limit,
    include: includeSteps,
  });
};

export const markStepOngoing = async (runId: string, step: number) => {
  await prisma.$transaction([
    prisma.jobRun.update({
      where: { id: runId },
      data: {
        status: JobStatus.ONGOING,
        error: null,
        completedAt: null,
      },
    }),
    prisma.jobRunStep.update({
      where: {
        runId_step: {
          runId,
          step,
        },
      },
      data: {
        status: JobStatus.ONGOING,
        startedAt: new Date(),
        completedAt: null,
        durationMs: null,
        error: null,
      },
    }),
  ]);
};

export const markStepComplete = async (
  runId: string,
  step: number,
  durationMs: number
) => {
  await prisma.jobRunStep.update({
    where: {
      runId_step: {
        runId,
        step,
      },
    },
    data: {
      status: JobStatus.COMPLETED,
      durationMs,
      completedAt: new Date(),
      error: null,
    },
  });
};

export const markRunComplete = async (runId: string) => {
  await prisma.jobRun.update({
    where: { id: runId },
    data: {
      status: JobStatus.COMPLETED,
      completedAt: new Date(),
      error: null,
    },
  });
};

export const markRunFailed = async (
  runId: string,
  message: string,
  step?: number
) => {
  if (step !== undefined) {
    await prisma.jobRunStep.update({
      where: {
        runId_step: {
          runId,
          step,
        },
      },
      data: {
        status: JobStatus.FAILED,
        completedAt: new Date(),
        error: message,
      },
    });
  }

  await prisma.jobRun.update({
    where: { id: runId },
    data: {
      status: JobStatus.FAILED,
      error: message,
      completedAt: new Date(),
    },
  });
};
