import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import { WORLD_CITIES } from '$lib/cities';
import { ADMIN_COOKIE, adminPassword, isAdmin } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

// Admin gate. Access is protected by a password checked SERVER-side; on success
// an httpOnly cookie (site-wide, so admin-only API writes are authorized too)
// is set. Set ADMIN_PASSWORD in the environment; 'buzito' is only a dev default.
export const load: PageServerLoad = ({ cookies }) => {
  return isAdmin(cookies)
    ? { authed: true as const, cities: WORLD_CITIES }
    : { authed: false as const, cities: [] as string[] };
};

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const form = await request.formData();
    const password = String(form.get('password') ?? '');
    if (password !== adminPassword()) {
      return fail(401, { error: 'Contraseña incorrecta.' });
    }
    cookies.set(ADMIN_COOKIE, password, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !dev,
      maxAge: 60 * 60 * 8, // 8 hours
    });
    throw redirect(303, '/admin');
  },
  logout: async ({ cookies }) => {
    // Clear both the current site-wide cookie and any legacy /admin-scoped one.
    cookies.delete(ADMIN_COOKIE, { path: '/' });
    cookies.delete(ADMIN_COOKIE, { path: '/admin' });
    throw redirect(303, '/admin');
  },
};
