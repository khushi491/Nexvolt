import type { Role } from '@nexvolt/shared';

/** The authenticated principal attached to each request (loaded fresh from DB per request). */
export interface AuthUser {
  id: string;
  roles: Role[];
  hostProfileId: string | null;
  isAdmin: boolean;
  isStaff: boolean;
}

export function isStaff(u: Pick<AuthUser, 'roles'>): boolean {
  return u.roles.includes('ADMIN') || u.roles.includes('SUPPORT');
}
