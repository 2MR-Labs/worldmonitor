import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `You are Aegis, an AI intelligence analyst embedded in the Aegis Command System — a real-time geopolitical and defense intelligence dashboard. Your role is to provide concise, analytical responses about:
- Current geopolitical events and conflicts
- Military movements and strategic posture
- Threat assessment and risk analysis
- Infrastructure and supply chain disruptions
- Regional stability and political developments

Be direct, factual, and analytical. Use intelligence community conventions. Cite regions and actors precisely. Keep responses concise unless the user asks for detail.`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req, 'POST, OPTIONS'),
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: getCorsHeaders(req, 'POST, OPTIONS'),
    });
  }

  if (isDisallowedOrigin(req)) {
    return new Response('Forbidden', { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      {
        status: 503,
        headers: { ...getCorsHeaders(req, 'POST, OPTIONS'), 'Content-Type': 'application/json' },
      },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...getCorsHeaders(req, 'POST, OPTIONS'), 'Content-Type': 'application/json' },
    });
  }

  const messages = (body.messages || []).slice(-20).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: typeof m.content === 'string' ? m.content.slice(0, 4000) : '',
  }));

  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), {
      status: 400,
      headers: { ...getCorsHeaders(req, 'POST, OPTIONS'), 'Content-Type': 'application/json' },
    });
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[chat] Anthropic API error:', anthropicRes.status, errText);
      return new Response(
        JSON.stringify({ error: 'AI service error', status: anthropicRes.status }),
        {
          status: 502,
          headers: { ...getCorsHeaders(req, 'POST, OPTIONS'), 'Content-Type': 'application/json' },
        },
      );
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text || '';

    return new Response(
      JSON.stringify({ text }),
      {
        status: 200,
        headers: {
          ...getCorsHeaders(req, 'POST, OPTIONS'),
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    console.error('[chat] Request failed:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req, 'POST, OPTIONS'), 'Content-Type': 'application/json' },
      },
    );
  }
}
