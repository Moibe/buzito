import { error } from '@sveltejs/kit';
import { WORLD_CITIES } from '$lib/cities';
import { readImage } from '$lib/server/cityImages';
import type { RequestHandler } from './$types';

// Public read of a city image (used by the admin now, and by the game later).
export const GET: RequestHandler = ({ params }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1 || n > WORLD_CITIES.length) throw error(404);
  const img = readImage(n, params.file);
  if (!img) throw error(404);
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      'content-type': img.type,
      // Filenames are unique per upload → the content at a URL never changes.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
