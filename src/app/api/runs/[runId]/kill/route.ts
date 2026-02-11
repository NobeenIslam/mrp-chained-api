import { NextResponse } from 'next/server';
import { formatPersistedRun, killRun } from '@/lib/run-store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const body = await request.json().catch(() => ({}));
  const message =
    typeof body.message === 'string' && body.message.trim().length > 0
      ? body.message.trim()
      : 'Manually stopped via kill switch.';

  const run = await killRun(runId, message);
  if (!run) {
    return NextResponse.json(
      {
        error: `Run ${runId} was not found.`,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    run: formatPersistedRun(run),
  });
}
