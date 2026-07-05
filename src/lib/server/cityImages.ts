import { readdirSync, existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Server-side store for a city's images: files under data/cities/<n>/, with the
// listing derived straight from the directory (no manifest to keep in sync).
// Each city holds up to MAX_IMAGES. Filenames are unique (timestamp+rand), so a
// given URL is immutable and safe to cache.
const ROOT = join(process.cwd(), 'data', 'cities');
export const MAX_IMAGES = 4;
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

export function listImages(n: number): string[] {
  const dir = cityDir(n);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => extOf(f) in EXT_TYPE)
    .sort();
}

export function addImage(
  n: number,
  originalName: string,
  bytes: Buffer
): { ok: true; file: string } | { ok: false; error: string } {
  const ext = extOf(originalName);
  if (!(ext in EXT_TYPE)) return { ok: false, error: 'Formato no permitido (PNG, JPG, WebP o GIF).' };
  if (bytes.length === 0) return { ok: false, error: 'Archivo vacío.' };
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'Imagen muy grande (máx 5 MB).' };
  if (listImages(n).length >= MAX_IMAGES) return { ok: false, error: `Máximo ${MAX_IMAGES} imágenes.` };
  const dir = cityDir(n);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  writeFileSync(join(dir, file), bytes);
  return { ok: true, file };
}

export function removeImage(n: number, file: string): boolean {
  if (!isSafeName(file)) return false;
  const p = join(cityDir(n), file);
  if (!existsSync(p)) return false;
  rmSync(p);
  return true;
}

export function readImage(n: number, file: string): { bytes: Buffer; type: string } | null {
  if (!isSafeName(file)) return null;
  const ext = extOf(file);
  if (!(ext in EXT_TYPE)) return null;
  const p = join(cityDir(n), file);
  if (!existsSync(p)) return null;
  return { bytes: readFileSync(p), type: EXT_TYPE[ext] };
}
