/**
 * COA Situation Report Builder
 *
 * Collects real-time intelligence data from AppContext and existing
 * aggregation services to produce a structured JSON situation report
 * for COA (Course of Action) generation via Claude AI.
 */

import type { AppContext } from '@/app/app-context';
import type { ClusteredEvent, MarketData } from '@/types';
import { getTopUnstableCountries, type CountryScore } from './country-instability';
import { signalAggregator, type RegionalConvergence } from './signal-aggregator';
import { focalPointDetector } from './focal-point-detector';
import { getCachedPosture, type CachedTheaterPosture } from './cached-theater-posture';
import { getCachedScores, type CachedRiskScores } from './cached-risk-scores';

// ── Interfaces ──

export interface SituationReport {
  timestamp: string;
  classification: string;

  topThreats: Array<{
    title: string;
    threatLevel: string;
    category: string;
    sources: number;
  }>;

  instabilityScores: Array<{
    country: string;
    code: string;
    score: number;
    level: string;
    trend: string;
    components: {
      unrest: number;
      conflict: number;
      security: number;
      information: number;
    };
  }>;

  theaterPosture: Array<{
    theater: string;
    postureLevel: string;
    aircraft: number;
    vessels: number;
    strikeCapable: boolean;
    targetNation: string | null;
    summary: string;
  }>;

  convergenceZones: Array<{
    region: string;
    signalTypes: string[];
    totalSignals: number;
    description: string;
  }>;

  focalPoints: Array<{
    entity: string;
    type: string;
    urgency: string;
    focalScore: number;
    newsMentions: number;
    signalCount: number;
    narrative: string;
  }>;

  cyberThreats: {
    total: number;
    critical: number;
    high: number;
  };

  marketIndicators: Array<{
    symbol: string;
    name: string;
    change: number;
  }>;

  predictions: Array<{
    question: string;
    probability: number;
  }>;

  strategicRisk: {
    score: number;
    level: string;
    trend: string;
  } | null;
}

// ── Helpers ──

const THREAT_PRIORITY: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  elevated: 3,
  low: 2,
  info: 1,
};

function getClusterThreatLevel(c: ClusteredEvent): string {
  return c.threat?.level ?? 'info';
}

function getClusterCategory(c: ClusteredEvent): string {
  if (c.allItems.length > 0) {
    const first = c.allItems[0];
    return first?.source ?? 'unknown';
  }
  return 'unknown';
}

// ── Main Builder ──

export function buildSituationReport(ctx: AppContext): SituationReport {
  // 1. Top threats from clustered events
  const topThreats = (ctx.latestClusters || [])
    .filter(c => c.isAlert || (THREAT_PRIORITY[getClusterThreatLevel(c)] ?? 0) >= 3)
    .sort((a, b) => {
      const pa = THREAT_PRIORITY[getClusterThreatLevel(a)] ?? 0;
      const pb = THREAT_PRIORITY[getClusterThreatLevel(b)] ?? 0;
      if (pb !== pa) return pb - pa;
      return b.sourceCount - a.sourceCount;
    })
    .slice(0, 15)
    .map(c => ({
      title: c.primaryTitle,
      threatLevel: getClusterThreatLevel(c),
      category: getClusterCategory(c),
      sources: c.sourceCount,
    }));

  // 2. Country instability scores (top 10)
  const ciiScores: CountryScore[] = getTopUnstableCountries(10);
  const instabilityScores = ciiScores.map(s => ({
    country: s.name,
    code: s.code,
    score: s.score,
    level: s.level,
    trend: s.trend,
    components: {
      unrest: Math.round(s.components.unrest),
      conflict: Math.round(s.components.conflict),
      security: Math.round(s.components.security),
      information: Math.round(s.components.information),
    },
  }));

  // 3. Theater posture
  const postureData: CachedTheaterPosture | null = getCachedPosture();
  const theaterPosture = (postureData?.postures || [])
    .filter(p => p.postureLevel !== 'normal' || p.totalAircraft > 0 || p.totalVessels > 0)
    .slice(0, 10)
    .map(p => ({
      theater: p.theaterName,
      postureLevel: p.postureLevel,
      aircraft: p.totalAircraft,
      vessels: p.totalVessels,
      strikeCapable: p.strikeCapable,
      targetNation: p.targetNation,
      summary: p.summary,
    }));

  // 4. Convergence zones from signal aggregator
  const convergenceData: RegionalConvergence[] = signalAggregator.getRegionalConvergence();
  const convergenceZones = convergenceData
    .slice(0, 5)
    .map(z => ({
      region: z.region,
      signalTypes: z.signalTypes,
      totalSignals: z.totalSignals,
      description: z.description,
    }));

  // 5. Focal points
  const focalSummary = focalPointDetector.getLastSummary();
  const focalPoints = (focalSummary?.focalPoints || [])
    .slice(0, 8)
    .map(fp => ({
      entity: fp.displayName,
      type: fp.entityType,
      urgency: fp.urgency,
      focalScore: fp.focalScore,
      newsMentions: fp.newsMentions,
      signalCount: fp.signalCount,
      narrative: fp.narrative,
    }));

  // 6. Cyber threats summary
  const cyberData = ctx.cyberThreatsCache || [];
  const cyberThreats = {
    total: cyberData.length,
    critical: cyberData.filter((t: { severity?: string }) => t.severity === 'critical').length,
    high: cyberData.filter((t: { severity?: string }) => t.severity === 'high').length,
  };

  // 7. Market indicators (top 5 movers by absolute change)
  const marketIndicators = (ctx.latestMarkets || [])
    .filter((m: MarketData) => m.change !== null && m.change !== undefined)
    .sort((a: MarketData, b: MarketData) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))
    .slice(0, 5)
    .map((m: MarketData) => ({
      symbol: m.symbol,
      name: m.name,
      change: m.change ?? 0,
    }));

  // 8. Top predictions
  const predictions = (ctx.latestPredictions || [])
    .slice(0, 5)
    .map(p => ({
      question: p.title,
      probability: p.yesPrice,
    }));

  // 9. Strategic risk
  const riskData: CachedRiskScores | null = getCachedScores();
  const strategicRisk = riskData?.strategicRisk
    ? {
        score: riskData.strategicRisk.score,
        level: riskData.strategicRisk.level,
        trend: riskData.strategicRisk.trend,
      }
    : null;

  return {
    timestamp: new Date().toISOString(),
    classification: 'UNCLASSIFIED // OSINT',
    topThreats,
    instabilityScores,
    theaterPosture,
    convergenceZones,
    focalPoints,
    cyberThreats,
    marketIndicators,
    predictions,
    strategicRisk,
  };
}
