import { NextResponse, type NextRequest } from 'next/server';

export const REFRESH_COOKIE = 'nv_rt';
const API =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Reject cross-site POSTs (defence in depth alongside SameSite=Strict). */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  return new URL(origin).host === req.headers.get('host');
}

export async function callApi(path: string, body: unknown, req: NextRequest) {
  return fetch(`${API}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': req.headers.get('user-agent') ?? 'nexvolt-web',
      'X-Forwarded-For': req.headers.get('x-forwarded-for') ?? '',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

interface AuthBody {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  user: unknown;
}

/** Return the access token to the page; keep the refresh token in an httpOnly cookie only. */
export function sessionResponse(auth: AuthBody): NextResponse {
  const res = NextResponse.json({
    accessToken: auth.accessToken,
    accessTokenExpiresAt: auth.accessTokenExpiresAt,
    user: auth.user,
  });
  res.cookies.set(REFRESH_COOKIE, auth.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/session',
    maxAge: 30 * 24 * 3600,
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export function clearSession(res: NextResponse): NextResponse {
  res.cookies.set(REFRESH_COOKIE, '', {
    httpOnly: true,
    path: '/api/session',
    maxAge: 0,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
