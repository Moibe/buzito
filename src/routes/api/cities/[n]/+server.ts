import { json, error } from '@sveltejs/kit';
import { WORLD_CITIES } from '$lib/cities';
import { listSlots } from '$lib/server/cityImages';
import type { RequestHandler } from './$types';

// Public: the image slots (filenames, null where empty) for a city. The game
// uses slot 1 as the arena image it reveals as tiles are covered.
export const GET: RequestHandler = ({ params }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1 || n > WORLD_CITIES.length) throw error(404);
  return json({ slots: listSlots(n) });
};
