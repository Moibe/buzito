import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

// Shared admin gate. The password is checked server-side; a matching httpOnly
// cookie (set on login) authorizes admin-only requests. Set ADMIN_PASSWORD in
// the environment; 'buzito' is only a local-dev fallback.
export const ADMIN_COOKIE = 'buzito_admin';
export const adminPassword = () => env.ADMIN_PASSWORD || 'buzito';

export function isAdmin(cookies: Cookies): boolean {
  return cookies.get(ADMIN_COOKIE) === adminPassword();
}
