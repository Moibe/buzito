import { readdirSync, existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Server-side store for a city's images, held in FOUR fixed positions (slots
// 1..4 — order matters). Files live under data/cities/<n>/ named
// `slot<k>-<timestamp><ext>`: the prefix pins the position, the timestamp keeps
// each upload's URL unique (so it's immutable-cacheable and a replace busts it).
const ROOT = join(process.cwd(), 'data', 'cities');
export const SLOTS = 4;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image

const EXT_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const cityDir = (n: number) => join(ROOT, String(n));
const extOf = (f: string) => {
  const i = f.lastIndexOf('.');
  return i < 0 ? '' : f.slice(i).toLowerCase();
};
// Reject anything that isn't a plain filename (blocks path traversal).
const isSafeName = (f: string) => /^[A-Za-z0-9._-]+$/.test(f) && !f.includes('..');
const validSlot = (k: number) => Number.isInteger(k) && k >= 1 && k <= SLOTS;

// Current filename occupying slot k (or null).
function slotFile(n: number, k: number): string | null {
  const dir = cityDir(n);
  if (!existsSync(dir)) return null;
  const pre = `slot${k}-`;
  const f = readdirSync(dir).find((x) => x.startsWith(pre) && extOf(x) in EXT_TYPE);
  return f ?? null;
}

// The 4 slots as filenames (index 0 = slot 1), null where empty.
export function listSlots(n: number): (string | null)[] {
  return Array.from({ length: SLOTS }, (_, i) => slotFile(n, i + 1));
}

// Put an image in slot k, replacing whatever was there.
export function setSlot(
  n: number,
  k: number,
  originalName: string,
  bytes: Buffer
): { ok: true; file: string } | { ok: false; error: string } {
  if (!validSlot(k)) return { ok: false, error: 'Posición inválida.' };
  const ext = extOf(originalName);
  if (!(ext in EXT_TYPE)) return { ok: false, error: 'Formato no permitido (PNG, JPG, WebP o GIF).' };
  if (bytes.length === 0) return { ok: false, error: 'Archivo vacío.' };
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'Imagen muy grande (máx 5 MB).' };
  try {
    const dir = cityDir(n);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const existing = slotFile(n, k);
    if (existing) rmSync(join(dir, existing));
    const file = `slot${k}-${Date.now()}${ext}`;
    writeFileSync(join(dir, file), bytes);
    return { ok: true, file };
  } catch {
    return { ok: false, error: 'No se pudo guardar la imagen en el servidor.' };
  }
}

// Empty slot k.
export function clearSlot(n: number, k: number): boolean {
  if (!validSlot(k)) return false;
  const existing = slotFile(n, k);
  if (!existing) return false;
  try {
    rmSync(join(cityDir(n), existing));
    return true;
  } catch {
    return false;
  }
}

export function readImage(n: number, file: string): { bytes: Buffer; type: string } | null {
  if (!isSafeName(file)) return null;
  const ext = extOf(file);
  if (!(ext in EXT_TYPE)) return null;
  const p = join(cityDir(n), file);
  if (!existsSync(p)) return null;
  try {
    return { bytes: readFileSync(p), type: EXT_TYPE[ext] };
  } catch {
    return null;
  }
}
