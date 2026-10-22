import { NextResponse, type NextRequest } from 'next/server';
import { callApi, sameOrigin, sessionResponse } from '@/lib/session-server';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req))
    return NextResponse.json(
      { code: 'FORBIDDEN', message: 'Cross-site request blocked' },
      { status: 403 },
    );
  const body = await req.json().catch(() => null);
  const upstream = await callApi('/auth/otp/verify', body, req);
  const json = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(json, { status: upstream.status });
  return sessionResponse(json);
}
