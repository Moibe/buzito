import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { fail, redirect } from '@sveltejs/kit';
import { WORLD_CITIES } from '$lib/cities';
import type { Actions, PageServerLoad } from './$types';

// Admin gate. Access is protected by a password checked SERVER-side; on success
// an httpOnly cookie (scoped to /admin) is set, so players can't reach the data
// without it. Set ADMIN_PASSWORD in the environment (.env / host config) — the
// 'buzito' fallback is only for local dev; change it for anything public.
const COOKIE = 'buzito_admin';
const adminPassword = () => env.ADMIN_PASSWORD || 'buzito';

export const load: PageServerLoad = ({ cookies }) => {
  const authed = cookies.get(COOKIE) === adminPassword();
  return authed
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
    cookies.set(COOKIE, password, {
      path: '/admin',
      httpOnly: true,
      sameSite: 'lax',
      secure: !dev,
      maxAge: 60 * 60 * 8, // 8 hours
    });
    throw redirect(303, '/admin');
  },
  logout: async ({ cookies }) => {
    cookies.delete(COOKIE, { path: '/admin' });
    throw redirect(303, '/admin');
  },
};
