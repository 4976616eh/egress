import { sanitizeSpec, type PlanSpec } from './planSpec';

/**
 * Where the AI proxy (api/server.mjs) lives. In local development, follow the
 * hostname used to open the app so localhost and 127.0.0.1 both reach their
 * matching API address. For a hosted build, set VITE_API_URL to the public API URL.
 */
const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const API_URL = (configuredApiUrl || (import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:8787`
  : '')).replace(/\/+$/, '');

/** Longest image side sent to the AI - larger images are not read any better and only slow the request down. */
const MAX_SIDE = 2048;

/** Downscales the plan and re-encodes it as JPEG (white behind transparent PNGs) to keep the upload small. */
export function prepareImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => reject(new Error('Изображението не може да бъде прочетено.'));
    img.src = src;
  });
}

/** `floor` is the floor index (0 = ground floor) the plan belongs to, so the AI picks the right one if the image shows several. */
export async function analyzePlan(background: string, signal?: AbortSignal, floor = 0): Promise<PlanSpec> {
  const image = await prepareImage(background);
  // Празен API_URL означава относителен път (същият домин), което работи на
  // Vercel чрез vercel.json rewrites (/analyze-plan → /api/analyze-plan.js).
  // В DEV режим, когато VITE_API_URL не е зададен, се 낙ъсва http://<host>:8787.
  let res: Response;
  try {
    res = await fetch(`${API_URL}/analyze-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, floor }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    // Детайлите за грешката отиват само в конзолата (за разработчика),
    // а потребителят вижда общо съобщение без вътрешни URL/портове.
    console.error('AI услуга грешка:', e);
    throw new Error('Няма достъп до AI услугата. Опитайте по-късно или начертайте плана ръчно.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'AI услугата върна грешка.');
  return sanitizeSpec(data?.plan);
}
