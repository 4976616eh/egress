// Vercel serverless function: health check for the API
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
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

  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(
    JSON.stringify({
      ok: true,
      ai: !!API_KEY,
      provider: PROVIDER,
      service: 'egress-api',
    })
  );
}