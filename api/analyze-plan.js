// Vercel serverless function: proxies uploaded plan images to Anthropic or Gemini.
// Keeps the AI API key server-side (never exposed to the browser).
import { SYSTEM_PROMPT, TOOL } from './prompt.mjs';

const MAX_IMAGE_B64 = 6_500_000;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const PROVIDER =
    process.env.AI_PROVIDER ||
    (process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY
      ? 'gemini'
      : 'anthropic');
  const API_KEY =
    PROVIDER === 'gemini'
      ? process.env.GEMINI_API_KEY
      : process.env.ANTHROPIC_API_KEY;
  const MODEL =
    PROVIDER === 'gemini'
      ? process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
      : process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

  if (!API_KEY) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        error: 'AI услугата не е настроена (липсва API ключ).',
      })
    );
  }

  let body;
  try {
    body =
      typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Невалидно тяло на заявката.' }));
  }

  const { image, floor = 0 } = body;

  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image || '');
  if (!m) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Невалидно изображение.' }));
  }
  if (m[2].length > MAX_IMAGE_B64) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Изображението е твърде голямо.' }));
  }

  const floorNum =
    Number.isInteger(floor) && floor >= 0 && floor < 20 ? floor : 0;

  try {
    if (PROVIDER === 'gemini') {
      return await handleGemini(res, m[1], m[2], floorNum, API_KEY, MODEL);
    }
    return await handleAnthropic(res, m[1], m[2], floorNum, API_KEY, MODEL);
  } catch (e) {
    console.error('AI error:', e);
    const status = e.status || 502;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({ error: e.message || 'AI услугата върна грешка.' })
    );
  }
}

async function handleGemini(res, mime, b64, floor, apiKey, model) {
  const system = SYSTEM_PROMPT.replace(
    'Always call submit_floor_plan exactly once.',
    'Answer with ONE JSON object only - no markdown, no commentary - that follows this JSON Schema exactly:\n' +
      JSON.stringify(TOOL.input_schema)
  );

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: mime, data: b64 } },
              {
                text: `This is the plan of floor index ${floor} (0 = ground floor). Extract the geometry of that floor and return the JSON object.`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 16000,
          thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || 'low' },
        },
      }),
      signal: AbortSignal.timeout(110_000),
    }
  );

  if (!r.ok) {
    const txt = (await r.text()).slice(0, 500);
    const err = new Error('Gemini API error: ' + r.status);
    err.status = 502;
    throw err;
  }

  const data = await r.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('')
    .trim();

  let plan;
  try {
    plan = JSON.parse(
      text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    );
  } catch {
    const err = new Error('AI не върна валиден JSON резултат.');
    err.status = 502;
    throw err;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ plan, model: data.modelVersion || model }));
}

async function handleAnthropic(res, mime, b64, floor, apiKey, model) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 10000,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mime, data: b64 },
            },
            {
              type: 'text',
              text: `This is the plan of floor index ${floor} (0 = ground floor). Extract the geometry of that floor and call submit_floor_plan.`,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(110_000),
  });

  if (!r.ok) {
    const txt = (await r.text()).slice(0, 500);
    const err = new Error('Anthropic API error: ' + r.status + ' ' + txt);
    err.status = 502;
    throw err;
  }

  const data = await r.json();
  const call = (data.content || []).find(
    (b) => b.type === 'tool_use' && b.name === TOOL.name
  );
  if (!call) {
    const err = new Error('AI не върна резултат за този план.');
    err.status = 502;
    throw err;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ plan: call.input, model: data.model }));
}