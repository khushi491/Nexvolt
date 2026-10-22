import { NextResponse, type NextRequest } from 'next/server';
import {
  callApi,
  clearSession,
  REFRESH_COOKIE,
  sameOrigin,
  sessionResponse,
} from '@/lib/session-server';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ code: 'FORBIDDEN' }, { status: 403 });
  const rt = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!rt) return NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
  const upstream = await callApi('/auth/refresh', { refreshToken: rt }, req);
  if (!upstream.ok)
    return clearSession(NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }));
  return sessionResponse(await upstream.json());
}
