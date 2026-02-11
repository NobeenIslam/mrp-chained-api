import { NextResponse } from 'next/server';
import { JobScenario } from '@prisma/client';
import { formatPersistedRun, listRuns } from '@/lib/run-store';

const scenarioParamToEnum = (scenario: string) => {
  switch (scenario) {
    case 'chained':
      return JobScenario.CHAINED;
    case 'sequential':
      return JobScenario.SEQUENTIAL;
    case 'race':
      return JobScenario.RACE;
    default:
      return null;
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 100)
    : 20;

  const scenarioParam = searchParams.get('scenario');
  const scenarioEnum = scenarioParam
    ? scenarioParamToEnum(scenarioParam.toLowerCase())
    : null;

  if (scenarioParam && !scenarioEnum) {
    return NextResponse.json(
      {
        error: 'Invalid scenario. Use one of: chained, sequential, race.',
      },
      { status: 400 }
    );
  }

  const runs = await listRuns(limit, scenarioEnum ?? undefined);

  return NextResponse.json({
    runs: runs.map(formatPersistedRun),
  });
}
