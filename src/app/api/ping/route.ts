import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const source = typeof body.source === 'string' ? body.source : 'unknown';

  console.log(
    `[ping] Called from "${source}" at ${new Date().toISOString()}`
  );

  return NextResponse.json({
    ok: true,
    source,
    timestamp: new Date().toISOString(),
  });
}
