import { NextResponse } from 'next/server';
import { getRun } from '@/lib/chain-store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');

  if (!runId) {
    return NextResponse.json(
      { error: 'Missing runId query parameter' },
      { status: 400 }
    );
  }

  const run = getRun(runId);

  if (!run) {
    return NextResponse.json(
      { error: `Run not found: ${runId}` },
      { status: 404 }
    );
  }

  return NextResponse.json(run);
}
