import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

const COA_MODEL = process.env.COA_MODEL || 'claude-haiku-4-5';

// System prompt embeds distilled commander_skills knowledge base.
// Edge Functions cannot read filesystem, so knowledge is baked in.
const COA_SYSTEM_PROMPT = `You are AEGIS COA GENERATOR, an AI Course of Action analysis engine integrated into the Aegis Command System — a real-time geopolitical and defense OSINT dashboard. You generate structured military-style COA analyses based on live intelligence data.

## GUIDELINES
- Base analysis on the situation report data only
- Exactly 2 courses of action with clear tradeoffs
- Non-kinetic only (OSINT-based advisory)
- Cover economic, diplomatic, cyber, information dimensions
- Respond in the SAME LANGUAGE as the situation report
- BE EXTREMELY CONCISE. Hard field-level word limits below — respect them strictly. No preamble. No markdown code fences.

## OUTPUT FORMAT
Respond ONLY with raw JSON matching this exact structure (no markdown, no preamble):
{
  "situationAssessment": {
    "summary": "1-2 sentences, max 40 words",
    "keyFindings": ["max 4 items, each under 12 words"],
    "primaryTheater": "2-4 words",
    "threatLevel": "CRITICAL|HIGH|ELEVATED|MODERATE",
    "keyFrictions": ["max 3 items, each under 15 words"]
  },
  "centerOfGravity": {
    "friendly": "ONE sentence describing friendly center of gravity, max 25 words",
    "adversary": "ONE sentence describing adversary center of gravity, max 25 words",
    "adversaryVulnerabilities": ["max 3 items, each under 12 words"]
  },
  "coursesOfAction": [
    {
      "id": "COA-1",
      "name": "max 5 words",
      "approach": "DIPLOMATIC|ECONOMIC|INFORMATION|CYBER|HYBRID",
      "description": "1-2 sentences, max 35 words",
      "advantages": ["max 2 items, each under 12 words"],
      "disadvantages": ["max 2 items, each under 12 words"],
      "riskLevel": "HIGH|MEDIUM|LOW",
      "timeframe": "IMMEDIATE|SHORT-TERM|LONG-TERM"
    }
  ],
  "recommendedAction": {
    "selectedCOA": "COA-1",
    "rationale": "1-2 sentences, max 30 words",
    "immediateActions": ["max 3 items, each under 10 words"],
    "decisionPoints": ["max 2 items, each under 10 words"]
  },
  "riskIndicators": [
    { "indicator": "2-4 words", "level": "CRITICAL|HIGH|MEDIUM|LOW", "description": "ONE sentence, max 15 words" }
  ]
}`;

function parseCoaJson(text) {
  let cleaned = text.trim()
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '');
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch {}
  }
  return { raw: text };
}

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

  const { situationReport } = body;
  if (!situationReport) {
    return new Response(JSON.stringify({ error: 'Missing situationReport' }), {
      status: 400,
      headers: { ...getCorsHeaders(req, 'POST, OPTIONS'), 'Content-Type': 'application/json' },
    });
  }

  // Truncate to stay within token budget
  const reportText = JSON.stringify(situationReport).slice(0, 12000);

  const t0 = Date.now();
  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: COA_MODEL,
        max_tokens: 8000,
        system: COA_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `SITUATION REPORT — ${situationReport.timestamp || new Date().toISOString()}\nClassification: ${situationReport.classification || 'UNCLASSIFIED // OSINT'}\n\n${reportText}\n\nGenerate a complete Course of Action analysis based on this intelligence data.`,
        }],
      }),
    });
    const tApi = Date.now() - t0;

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[coa] Anthropic API error', { status: anthropicRes.status, elapsed_ms: tApi, err: errText });
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

    const coa = parseCoaJson(text);
    const tTotal = Date.now() - t0;
    console.log('[coa] done', {
      model: COA_MODEL,
      elapsed_ms: tTotal,
      api_ms: tApi,
      stop_reason: data.stop_reason,
      input_tokens: data.usage?.input_tokens,
      output_tokens: data.usage?.output_tokens,
      text_length: text.length,
      parsed: !coa.raw,
    });
    if (coa.raw) {
      console.error('[coa] JSON parse failed', {
        prefix: text.slice(0, 300),
        suffix: text.slice(-300),
      });
    }

    return new Response(
      JSON.stringify({ coa, generatedAt: new Date().toISOString() }),
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
    console.error('[coa] Request failed', { elapsed_ms: Date.now() - t0, err: String(err) });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req, 'POST, OPTIONS'), 'Content-Type': 'application/json' },
      },
    );
  }
}
