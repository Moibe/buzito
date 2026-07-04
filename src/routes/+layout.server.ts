import { getSettings } from '$lib/server/settings';
import type { LayoutServerLoad } from './$types';

// Provide the server-persisted settings to every route (SSR), so the game and
// the admin both start from the admin's saved rules.
export const load: LayoutServerLoad = () => ({ settings: getSettings() });
