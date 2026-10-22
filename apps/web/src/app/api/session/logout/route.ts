import { NextResponse, type NextRequest } from 'next/server';
import { callApi, clearSession, REFRESH_COOKIE, sameOrigin } from '@/lib/session-server';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ code: 'FORBIDDEN' }, { status: 403 });
  const rt = req.cookies.get(REFRESH_COOKIE)?.value;
  if (rt) await callApi('/auth/logout', { refreshToken: rt }, req).catch(() => undefined);
  return clearSession(new NextResponse(null, { status: 204 }));
}
