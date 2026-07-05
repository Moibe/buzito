import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

// Shared admin gate. The password is checked server-side; a matching httpOnly
// cookie (set on login) authorizes admin-only requests. Set ADMIN_PASSWORD in
// the environment.
export const ADMIN_COOKIE = 'buzito_admin';

// Fail-closed default: 'buzito' is ONLY the local-dev fallback. In production
// without ADMIN_PASSWORD we return an unguessable per-process value so no typed
// password can ever match (admin stays locked) instead of silently exposing it
// with the public literal.
const NO_LOGIN_SENTINEL =
  'disabled-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
let warned = false;

export const adminPassword = () => {
  const p = env.ADMIN_PASSWORD;
  if (p) return p;
  if (dev) return 'buzito';
  if (!warned) {
    console.warn('[buzito] ADMIN_PASSWORD no configurado — el panel de admin queda bloqueado.');
    warned = true;
  }
  return NO_LOGIN_SENTINEL;
};

export function isAdmin(cookies: Cookies): boolean {
  return cookies.get(ADMIN_COOKIE) === adminPassword();
}
