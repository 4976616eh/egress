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
  if (!API_URL) {
    throw new Error('AI услугата не е конфигурирана за този сайт. Задай VITE_API_URL с публичния адрес на AI API услугата.');
  }
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
    const hint = import.meta.env.DEV
      ? 'Провери, че API сървърът работи с „npm run api“ и че адресът на сайта е включен в ALLOWED_ORIGINS в api/.env.'
      : 'Задай VITE_API_URL към публичния адрес на API услугата и добави адреса на сайта в ALLOWED_ORIGINS на API услугата.';
    throw new Error(`Няма връзка с AI услугата (${API_URL}). ${hint} Можеш да начертаеш плана ръчно.`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'AI услугата върна грешка.');
  return sanitizeSpec(data?.plan);
}
