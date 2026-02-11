import { after, NextResponse } from 'next/server';
import { simulateJob } from '@/lib/jobs';
import { config } from '@/lib/config';

export const maxDuration = 15;

const VALID_STEPS = new Set([1, 2, 3, 4]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ step: string }> }
) {
  const { step: stepParam } = await params;
  const step = Number(stepParam);

  if (!VALID_STEPS.has(step)) {
    return NextResponse.json(
      { error: `Invalid step: ${stepParam}. Must be 1-${config.totalSteps}.` },
      { status: 400 }
    );
  }

  console.log(`[chained] Step ${step} starting...`);
  const result = await simulateJob(step);
  console.log(`[chained] Step ${step} complete (${result.duration}ms)`);

  after(() => {
    console.log(
      `[after] Step ${step} response sent at ${new Date().toISOString()}`
    );
  });

  return NextResponse.json(result);
}
