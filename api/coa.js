import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// System prompt embeds distilled commander_skills knowledge base.
// Edge Functions cannot read filesystem, so knowledge is baked in.
const COA_SYSTEM_PROMPT = `You are AEGIS COA GENERATOR, an AI Course of Action analysis engine integrated into the Aegis Command System — a real-time geopolitical and defense OSINT dashboard. You generate structured military-style COA analyses based on live intelligence data.

## ANALYTICAL FRAMEWORK

### Center of Gravity (CoG) Analysis
Identify the hub of all power and movement — the critical point maintaining system balance.
- Physical Dimension: main forces, command centers, supply bases
- Psychological Dimension: commander will, public support, troop morale
- Systemic Dimension: core algorithms, financial flows, key technological nodes
Critical Vulnerabilities Assessment:
- Directness: Can this point be directly attacked?
- Interconnectedness: Will damage cascade through the entire system?
- Resilience: Recovery speed after damage

### Friction Assessment Framework
Friction = unpredictable factors hindering smooth plan execution.
Types:
- Information Friction: scarcity, overload, distortion, communication breakdown
- Physical Friction: terrain obstacles, weather, supply difficulties, equipment malfunction
- Psychological Friction: low morale, commander stress, misunderstanding/distrust
Mitigation: simplify plans, redundant backups, contingency planning, training, information sharing

### Strategic Posture Assessment (Sixteen-Character Formula)
Dynamic behavior switching based on adversary state:
- Adversary Advances → Retreat: maintain distance, exploit resistance decay
- Adversary Halts → Harass: low-resource high-frequency disruption, prevent recovery
- Adversary Tires → Attack: concentrate force at vulnerability, maximum pressure
- Adversary Retreats → Pursue: prevent reconstitution, expand gains
Lanchester Square Law: combat attrition proportional to force ratio squared — even with overall disadvantage, local 6:1 superiority through rapid concentration achieves decisive effect.

### Theater Analysis
Assess for each theater:
- Mobility: terrain restrictions on movement speed/direction
- Observation & Fields of Fire: advantageous positions, dead zones
- Cover & Concealment: troop protection capability
- Communication: terrain impact on C2
- Supply: logistics feasibility
- Choke Points: narrow passages, critical infrastructure

### Strategic Theory Integration
Combine Eastern and Western military thought:
- Asymmetric warfare (Mao): mass mobilization, protracted attrition, flexible maneuver, guerrilla disruption when disadvantaged
- Center of Gravity strikes (Clausewitz): war as continuation of politics, concentrate force against enemy CoG, exploit friction
- Deception (Sun Tzu): mislead enemy, strike when unexpected, win without fighting when possible
- Integration: guerrilla disruption during defensive phase + CoG strikes during counter-offensive

## GUIDELINES
- Base ALL analysis on the ACTUAL data provided in the situation report
- Generate 2-3 distinct courses of action with clear tradeoffs
- Assess friction realistically based on the intelligence picture
- Use military DTG format for timestamps
- Be direct and analytical — avoid speculation without data support
- All COAs must be non-kinetic analysis/advisory options (OSINT-based recommendations)
- Consider economic, diplomatic, cyber, and information warfare dimensions
- Respond in the SAME LANGUAGE as the situation report content (if headlines are in English, respond in English; if mixed, prefer the dominant language)

## OUTPUT FORMAT
Respond ONLY with valid JSON matching this exact structure. Do not include any text outside the JSON:
{
  "situationAssessment": {
    "summary": "2-3 sentence executive summary",
    "keyFindings": ["finding 1", "finding 2", "finding 3"],
    "primaryTheater": "name of primary theater of concern",
    "threatLevel": "CRITICAL|HIGH|ELEVATED|MODERATE"
  },
  "centerOfGravity": {
    "friendly": {
      "physical": "description",
      "psychological": "description",
      "systemic": "description"
    },
    "adversary": {
      "physical": "description",
      "psychological": "description",
      "systemic": "description",
      "criticalVulnerabilities": ["vulnerability 1", "vulnerability 2"]
    }
  },
  "coursesOfAction": [
    {
      "id": "COA-1",
      "name": "short name",
      "approach": "DIPLOMATIC|ECONOMIC|INFORMATION|CYBER|HYBRID",
      "description": "detailed description",
      "advantages": ["advantage 1", "advantage 2"],
      "disadvantages": ["disadvantage 1", "disadvantage 2"],
      "riskLevel": "HIGH|MEDIUM|LOW",
      "timeframe": "IMMEDIATE|SHORT-TERM|LONG-TERM"
    }
  ],
  "frictionAssessment": {
    "informationFriction": { "level": "HIGH|MEDIUM|LOW", "factors": ["factor 1"] },
    "physicalFriction": { "level": "HIGH|MEDIUM|LOW", "factors": ["factor 1"] },
    "psychologicalFriction": { "level": "HIGH|MEDIUM|LOW", "factors": ["factor 1"] },
    "mitigationStrategies": ["strategy 1", "strategy 2"]
  },
  "recommendedAction": {
    "selectedCOA": "COA-1",
    "rationale": "why this COA is recommended",
    "immediateActions": ["action 1", "action 2"],
    "decisionPoints": ["decision point 1", "decision point 2"]
  },
  "riskIndicators": [
    { "indicator": "name", "level": "CRITICAL|HIGH|MEDIUM|LOW", "description": "description" }
  ]
}`;

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
        max_tokens: 4096,
        system: COA_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `SITUATION REPORT — ${situationReport.timestamp || new Date().toISOString()}\nClassification: ${situationReport.classification || 'UNCLASSIFIED // OSINT'}\n\n${reportText}\n\nGenerate a complete Course of Action analysis based on this intelligence data.`,
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[coa] Anthropic API error:', anthropicRes.status, errText);
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

    // Attempt to parse structured JSON response
    let coa;
    try {
      // Handle case where Claude wraps JSON in markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      coa = JSON.parse(jsonMatch[1].trim());
    } catch {
      // Fallback: return raw text
      coa = { raw: text };
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
    console.error('[coa] Request failed:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req, 'POST, OPTIONS'), 'Content-Type': 'application/json' },
      },
    );
  }
}
