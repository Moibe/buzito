import { error, fail, redirect } from '@sveltejs/kit';
import { WORLD_CITIES } from '$lib/cities';
import { isAdmin } from '$lib/server/auth';
import { listSlots, setSlot, clearSlot, SLOTS } from '$lib/server/cityImages';
import type { Actions, PageServerLoad } from './$types';

// Resolve the 1-based city number from the route param, or null if invalid.
function parseN(param: string | undefined): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n >= 1 && n <= WORLD_CITIES.length ? n : null;
}

export const load: PageServerLoad = ({ params, cookies }) => {
  if (!isAdmin(cookies)) throw redirect(303, '/admin'); // gate: bounce to login
  const n = parseN(params.n);
  if (!n) throw error(404, 'Ciudad no encontrada');
  return { n, city: WORLD_CITIES[n - 1], slots: listSlots(n), max: SLOTS };
};

export const actions: Actions = {
  // Upload/replace the image in a specific slot (position 1..4).
  upload: async ({ params, cookies, request }) => {
    if (!isAdmin(cookies)) return fail(401, { error: 'No autorizado.' });
    const n = parseN(params.n);
    if (!n) return fail(404, { error: 'Ciudad inválida.' });
    const form = await request.formData();
    const slot = Number(form.get('slot'));
    const file = form.get('image');
    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { error: 'Selecciona una imagen.' });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const res = setSlot(n, slot, file.name, bytes);
    if (!res.ok) return fail(400, { error: res.error });
    return { success: true };
  },
  // Empty a specific slot.
  remove: async ({ params, cookies, request }) => {
    if (!isAdmin(cookies)) return fail(401, { error: 'No autorizado.' });
    const n = parseN(params.n);
    if (!n) return fail(404, { error: 'Ciudad inválida.' });
    const form = await request.formData();
    const slot = Number(form.get('slot'));
    if (!clearSlot(n, slot)) return fail(400, { error: 'No se pudo quitar la imagen.' });
    return { success: true };
  },
};
