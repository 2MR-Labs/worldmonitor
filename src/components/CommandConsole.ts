/**
 * Command Console — COA Generation Component
 *
 * Wires up the "GENERATE COA" button in the Command Console,
 * collects real-time situation data from AppContext, calls the
 * COA API endpoint, and renders the structured military-style output.
 */

import type { AppContext } from '@/app/app-context';
import { buildSituationReport } from '@/services/coa-situation-report';
import { escapeHtml } from '@/utils/sanitize';

const API_BASE = import.meta.env.VITE_WS_API_URL || '';

// ── COA Response Types ──

interface COASituationAssessment {
  summary: string;
  keyFindings: string[];
  primaryTheater: string;
  threatLevel: string;
  keyFrictions?: string[];
}

interface COACenterOfGravity {
  friendly: string;
  adversary: string;
  adversaryVulnerabilities: string[];
}

interface COACourseOfAction {
  id: string;
  name: string;
  approach: string;
  description: string;
  advantages: string[];
  disadvantages: string[];
  riskLevel: string;
  timeframe: string;
}

interface COARecommendedAction {
  selectedCOA: string;
  rationale: string;
  immediateActions: string[];
  decisionPoints: string[];
}

interface COARiskIndicator {
  indicator: string;
  level: string;
  description: string;
}

interface COAResponse {
  situationAssessment: COASituationAssessment;
  centerOfGravity?: COACenterOfGravity;
  coursesOfAction: COACourseOfAction[];
  recommendedAction: COARecommendedAction;
  riskIndicators: COARiskIndicator[];
  raw?: string;
}

// ── Helpers ──

function formatDTG(): string {
  const now = new Date();
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[now.getUTCMonth()]!;
  const year = now.getUTCFullYear();
  return `${day}${hour}${min}Z${month}${year}`;
}

function threatBadgeClass(level: string): string {
  const l = level.toUpperCase();
  if (l === 'CRITICAL') return 'coa-threat-critical';
  if (l === 'HIGH') return 'coa-threat-high';
  if (l === 'ELEVATED') return 'coa-threat-elevated';
  return 'coa-threat-moderate';
}

function riskBadgeClass(level: string): string {
  const l = level.toUpperCase();
  if (l === 'CRITICAL' || l === 'HIGH') return 'coa-risk-high';
  if (l === 'MEDIUM') return 'coa-risk-medium';
  return 'coa-risk-low';
}

// ── Component ──

export class CommandConsole {
  private ctx: AppContext;
  private consoleEl: HTMLElement | null;
  private bodyEl: HTMLElement | null;
  private coaBtn: HTMLButtonElement | null;
  private loading = false;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.consoleEl = document.getElementById('commandConsole');
    this.bodyEl = this.consoleEl?.querySelector('.command-console-body') as HTMLElement | null;
    this.coaBtn = document.getElementById('commandCoaBtn') as HTMLButtonElement | null;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.coaBtn?.addEventListener('click', () => this.handleGenerateCOA());
  }

  private async handleGenerateCOA(): Promise<void> {
    if (this.loading || !this.bodyEl || !this.coaBtn) return;
    this.loading = true;
    this.coaBtn.classList.add('loading');
    this.setLoadingState();

    try {
      const report = buildSituationReport(this.ctx);
      const res = await fetch(`${API_BASE}/api/coa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situationReport: report }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const coa = data.coa as COAResponse;

      if (coa.raw) {
        this.renderRawCOA(coa.raw);
      } else {
        this.renderCOA(coa);
      }
    } catch (err) {
      this.renderError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      this.loading = false;
      this.coaBtn?.classList.remove('loading');
    }
  }

  private setLoadingState(): void {
    this.expandConsole();
    if (!this.bodyEl) return;
    const clusterCount = this.ctx.latestClusters?.length ?? 0;
    this.bodyEl.innerHTML = `
      <div class="coa-loading">
        <div class="coa-loading-spinner"></div>
        <div class="coa-loading-text">GENERATING COURSE OF ACTION</div>
        <div class="coa-loading-sub">Analyzing ${clusterCount} intelligence clusters across ${Object.keys(this.ctx.newsByCategory).length} regions</div>
      </div>`;
  }

  private expandConsole(): void {
    if (!this.consoleEl) return;
    this.consoleEl.style.height = 'auto';
    this.consoleEl.style.flex = '1 1 auto';
    this.consoleEl.style.minHeight = '300px';
    this.consoleEl.style.maxHeight = '500px';
  }

  private renderCOA(coa: COAResponse): void {
    if (!this.bodyEl) return;
    const dtg = formatDTG();

    const sa = coa.situationAssessment;
    const cog = coa.centerOfGravity;
    const rec = coa.recommendedAction;

    let html = `<div class="coa-report">`;

    // Header
    html += `
      <div class="coa-header">
        <span class="coa-classification">${escapeHtml(sa?.threatLevel === 'CRITICAL' ? 'PRIORITY // OSINT' : 'UNCLASSIFIED // OSINT')}</span>
        <span class="coa-timestamp">DTG: ${dtg}</span>
      </div>`;

    // 1. Situation Assessment
    if (sa) {
      html += `
        <div class="coa-section">
          <div class="coa-section-title">1. SITUATION ASSESSMENT</div>
          <div class="coa-section-content">
            <span class="coa-threat-badge ${threatBadgeClass(sa.threatLevel)}">${escapeHtml(sa.threatLevel)}</span>
            ${sa.primaryTheater ? `<span class="coa-theater-tag">${escapeHtml(sa.primaryTheater)}</span>` : ''}
            <p class="coa-summary">${escapeHtml(sa.summary)}</p>
            ${sa.keyFindings?.length ? `<ul class="coa-findings">${sa.keyFindings.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}
            ${sa.keyFrictions?.length ? `
              <div class="coa-frictions">
                <div class="coa-frictions-label">Key Frictions:</div>
                <ul>${sa.keyFrictions.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
              </div>
            ` : ''}
          </div>
        </div>`;
    }

    // 2. Center of Gravity
    if (cog) {
      html += `
        <div class="coa-section">
          <div class="coa-section-title">2. CENTER OF GRAVITY</div>
          <div class="coa-cog-grid">
            <div class="coa-cog-card">
              <div class="coa-cog-label">FRIENDLY CoG</div>
              <p class="coa-cog-text">${escapeHtml(cog.friendly ?? '—')}</p>
            </div>
            <div class="coa-cog-card">
              <div class="coa-cog-label">ADVERSARY CoG</div>
              <p class="coa-cog-text">${escapeHtml(cog.adversary ?? '—')}</p>
              ${cog.adversaryVulnerabilities?.length ? `
                <div class="coa-cog-vulns">
                  <span class="coa-cog-dim">Vulnerabilities:</span>
                  <ul>${cog.adversaryVulnerabilities.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul>
                </div>
              ` : ''}
            </div>
          </div>
        </div>`;
    }

    // 3. Courses of Action
    if (coa.coursesOfAction?.length) {
      html += `
        <div class="coa-section">
          <div class="coa-section-title">3. COURSES OF ACTION</div>
          ${coa.coursesOfAction.map(c => `
            <div class="coa-card ${rec?.selectedCOA === c.id ? 'coa-card-selected' : ''}">
              <div class="coa-card-header">
                <span class="coa-card-id">${escapeHtml(c.id)}</span>
                <span class="coa-card-name">${escapeHtml(c.name)}</span>
                <span class="coa-risk-badge ${riskBadgeClass(c.riskLevel)}">${escapeHtml(c.riskLevel)} RISK</span>
                ${c.approach ? `<span class="coa-approach-tag">${escapeHtml(c.approach)}</span>` : ''}
                ${c.timeframe ? `<span class="coa-timeframe-tag">${escapeHtml(c.timeframe)}</span>` : ''}
              </div>
              <p class="coa-card-desc">${escapeHtml(c.description)}</p>
              <div class="coa-pros-cons">
                <div class="coa-pros">
                  <div class="coa-pros-label">Advantages</div>
                  <ul>${(c.advantages || []).map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
                </div>
                <div class="coa-cons">
                  <div class="coa-cons-label">Disadvantages</div>
                  <ul>${(c.disadvantages || []).map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
                </div>
              </div>
            </div>
          `).join('')}
        </div>`;
    }

    // 4. Recommended Action
    if (rec) {
      html += `
        <div class="coa-section coa-section-recommended">
          <div class="coa-section-title">4. RECOMMENDED ACTION</div>
          <div class="coa-rec-selected">${escapeHtml(rec.selectedCOA)}: ${escapeHtml(rec.rationale)}</div>
          ${rec.immediateActions?.length ? `
            <div class="coa-rec-actions">
              <div class="coa-rec-label">Immediate Actions:</div>
              <ol>${rec.immediateActions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ol>
            </div>
          ` : ''}
          ${rec.decisionPoints?.length ? `
            <div class="coa-rec-decisions">
              <div class="coa-rec-label">Decision Points:</div>
              <ul>${rec.decisionPoints.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
            </div>
          ` : ''}
        </div>`;
    }

    // 5. Risk Indicators
    if (coa.riskIndicators?.length) {
      html += `
        <div class="coa-section">
          <div class="coa-section-title">5. RISK INDICATORS</div>
          <div class="coa-risk-list">
            ${coa.riskIndicators.map(r => `
              <div class="coa-risk-item">
                <span class="coa-risk-dot ${riskBadgeClass(r.level)}"></span>
                <span class="coa-risk-level">${escapeHtml(r.level)}</span>
                <span class="coa-risk-name">${escapeHtml(r.indicator)}</span>
                <span class="coa-risk-desc">${escapeHtml(r.description)}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    html += `</div>`;
    this.bodyEl.classList.add('has-content');
    this.bodyEl.innerHTML = html;
    this.bodyEl.scrollTop = 0;
  }

  private renderRawCOA(text: string): void {
    if (!this.bodyEl) return;
    this.bodyEl.classList.add('has-content');
    this.bodyEl.innerHTML = `
      <div class="coa-report">
        <div class="coa-header">
          <span class="coa-classification">UNCLASSIFIED // OSINT</span>
          <span class="coa-timestamp">DTG: ${formatDTG()}</span>
        </div>
        <div class="coa-section">
          <div class="coa-section-title">COA ANALYSIS</div>
          <pre class="coa-raw-text">${escapeHtml(text)}</pre>
        </div>
      </div>`;
    this.bodyEl.scrollTop = 0;
  }

  private renderError(message: string): void {
    if (!this.bodyEl) return;
    this.bodyEl.innerHTML = `
      <div class="coa-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <div class="coa-error-title">COA GENERATION FAILED</div>
        <div class="coa-error-msg">${escapeHtml(message)}</div>
      </div>`;
  }

  destroy(): void {
    // Clean up if needed
  }
}
