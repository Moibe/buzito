import { json, error } from '@sveltejs/kit';
import { getSettings, saveSettings } from '$lib/server/settings';
import { isAdmin } from '$lib/server/auth';
import type { RequestHandler } from './$types';

// Public read — the game loads these to apply the admin's rules.
export const GET: RequestHandler = () => json(getSettings());

// Admin-only write — persists the settings for all players.
export const PUT: RequestHandler = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) throw error(401, 'No autorizado');
  const body = await request.json().catch(() => ({}));
  return json(saveSettings(body));
};
