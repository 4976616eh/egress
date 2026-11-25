// Tiny proxy between the browser and the Anthropic API. It keeps the API key on the server
// and turns an uploaded plan image into structured geometry. No dependencies.
import http from 'node:http';
import { SYSTEM_PROMPT, TOOL } from './prompt.mjs';

const PORT = Number(process.env.PORT) || 8787;
// Which AI answers: 'anthropic' (default) or 'gemini' (free key from aistudio.google.com/app/apikey).
// If only GEMINI_API_KEY is set, Gemini is chosen automatically.
const PROVIDER = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY ? 'gemini' : 'anthropic')).toLowerCase();
const API_KEY = PROVIDER === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
const MODEL = PROVIDER === 'gemini' ? process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' : process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const ALLOWED = (process.env.ALLOWED_ORIGINS ||
  'http://localhost:5173,http://localhost:4173,http://localhost:8080,https://git-happens.junioraccelerator.org')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_BODY = 9 * 1024 * 1024;       // request body, bytes
const MAX_IMAGE_B64 = 6_500_000;        // Anthropic accepts images up to 5 MB (~6.7M base64 chars)
const RATE_LIMIT = 8;                   // analyses per minute per client
const DAILY_PER_CLIENT = Number(process.env.DAILY_LIMIT_PER_CLIENT) || 40;
const DAILY_TOTAL = Number(process.env.DAILY_LIMIT_TOTAL) || 400;   // hard ceiling on what the key can be charged per day
// How many reverse proxies stand in front of this server (each appends to X-Forwarded-For). 0 = none, use the socket address.
const TRUST_PROXY_HOPS = process.env.TRUST_PROXY_HOPS === undefined ? 1 : Math.max(0, Number(process.env.TRUST_PROXY_HOPS) || 0);
const hits = new Map();

/**
 * The caller's address. Each trusted proxy appends the address it saw to X-Forwarded-For, so the real client
 * is the Nth entry counted from the RIGHT. Entries further left are written by the client itself and must not be trusted
 * (taking the first one lets anybody dodge the limits just by sending a different header every time).
 */
export function clientIp(req) {
  const socketIp = req.socket.remoteAddress || 'unknown';
  if (TRUST_PROXY_HOPS < 1) return socketIp;
  const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length >= TRUST_PROXY_HOPS ? parts[parts.length - TRUST_PROXY_HOPS] : socketIp;
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k);
  return recent.length > RATE_LIMIT;
}

// Daily budget, counted only for requests that are about to reach the AI (junk requests do not eat it).
const today = () => new Date().toISOString().slice(0, 10);
let daily = { day: today(), total: 0, perIp: new Map() };

/** Reserves one analysis for `ip`. Returns null if allowed, otherwise 'day' (this client) or 'total' (everybody). */
function reserveDaily(ip) {
  if (daily.day !== today()) daily = { day: today(), total: 0, perIp: new Map() };
  if (daily.total >= DAILY_TOTAL || daily.perIp.size > 50_000) return 'total';
  const n = daily.perIp.get(ip) || 0;
  if (n >= DAILY_PER_CLIENT) return 'day';
  daily.perIp.set(ip, n + 1);
  daily.total++;
  return null;
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED.includes('*') || ALLOWED.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Gemini variant: same prompt and schema, answered as plain JSON (the front end validates and repairs it anyway). */
async function analyzeGemini(mime, b64, floor) {
  const system = SYSTEM_PROMPT.replace(
    'Always call submit_floor_plan exactly once.',
    'Answer with ONE JSON object only - no markdown, no commentary - that follows this JSON Schema exactly:\n' + JSON.stringify(TOOL.input_schema),
  );
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mime, data: b64 } },
          { text: `This is the plan of floor index ${floor} (0 = ground floor). Extract the geometry of that floor and return the JSON object.` },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 16000,
        thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || 'low' },
      },
    }),
    signal: AbortSignal.timeout(110_000),
  });

  if (!r.ok) {
    const txt = (await r.text()).slice(0, 500);
    console.error('Gemini API error', r.status, txt);
    const msg = r.status === 401 || r.status === 403 || (r.status === 400 && /API key/i.test(txt))
      ? 'AI услугата не е настроена правилно (ключ).'
      : r.status === 429 || r.status === 503
        ? 'AI услугата е претоварена или безплатната квота е изчерпана, опитай след малко.'
        : r.status === 404
          ? 'Gemini моделът не е наличен за този API ключ. Провери стойността на GEMINI_MODEL.'
          : 'AI услугата върна грешка.';
    throw Object.assign(new Error(msg), { status: 502 });
  }
  const data = await r.json();
  const cand = data.candidates?.[0];
  if (cand?.finishReason === 'MAX_TOKENS') throw Object.assign(new Error('Планът е твърде сложен за автоматично разчитане.'), { status: 422 });
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  let plan;
  try {
    plan = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    throw Object.assign(new Error('AI не върна резултат за този план.'), { status: 502 });
  }
  return { plan, model: data.modelVersion || MODEL };
}

async function analyze(image, floor, ip) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image || '');
  if (!m) throw Object.assign(new Error('Невалидно изображение.'), { status: 400 });
  if (m[2].length > MAX_IMAGE_B64) throw Object.assign(new Error('Изображението е твърде голямо.'), { status: 413 });
  const over = reserveDaily(ip);
  if (over)
    throw Object.assign(
      new Error(over === 'total' ? 'Дневният лимит на AI услугата е изчерпан - опитай утре или начертай плана ръчно.' : 'Дневният лимит за този адрес е изчерпан - опитай утре или начертай плана ръчно.'),
      { status: 429 },
    );
  if (PROVIDER === 'gemini') return analyzeGemini(m[1], m[2], floor);

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 10000,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: `This is the plan of floor index ${floor} (0 = ground floor). Extract the geometry of that floor and call submit_floor_plan.` },
        ],
      }],
    }),
    signal: AbortSignal.timeout(110_000),
  });

  if (!r.ok) {
    console.error('Anthropic API error', r.status, (await r.text()).slice(0, 500));
    const msg = r.status === 401 || r.status === 403
      ? 'AI услугата не е настроена правилно (ключ).'
      : r.status === 429 || r.status === 529
        ? 'AI услугата е претоварена, опитай след малко.'
        : 'AI услугата върна грешка.';
    throw Object.assign(new Error(msg), { status: 502 });
  }
  const data = await r.json();
  if (data.stop_reason === 'max_tokens') throw Object.assign(new Error('Планът е твърде сложен за автоматично разчитане.'), { status: 422 });
  const call = (data.content || []).find((b) => b.type === 'tool_use' && b.name === TOOL.name);
  if (!call) throw Object.assign(new Error('AI не върна резултат за този план.'), { status: 502 });
  return { plan: call.input, model: data.model };
}

http.createServer(async (req, res) => {
  cors(req, res);
  const path = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && (path === '/' || path === '/health')) return send(res, 200, { ok: true, ai: !!API_KEY });

  if (req.method === 'POST' && path === '/analyze-plan') {
    if (!API_KEY) return send(res, 503, { error: `AI услугата не е настроена (липсва ${PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'}).` });
    const ip = clientIp(req);
    if (rateLimited(ip)) return send(res, 429, { error: 'Твърде много заявки - изчакай минута.' });
    try {
      const body = JSON.parse(await readBody(req));
      const floor = Number.isInteger(body.floor) && body.floor >= 0 && body.floor < 20 ? body.floor : 0;
      send(res, 200, await analyze(body.image, floor, ip));
    } catch (e) {
      const status = e instanceof SyntaxError ? 400 : e.status || (e.name === 'TimeoutError' ? 504 : 500);
      if (!e.status) console.error(e);
      send(res, status, { error: e.name === 'TimeoutError' ? 'AI отне твърде дълго - опитай пак.' : e.status ? e.message : 'Вътрешна грешка.' });
    }
    return;
  }
  send(res, 404, { error: 'Not found' });
}).listen(PORT, '0.0.0.0', () => console.log(`egress-api on :${PORT} (${PROVIDER}, model ${MODEL}, key ${API_KEY ? 'set' : 'MISSING'})`));
