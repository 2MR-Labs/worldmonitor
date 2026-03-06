import type { AppContext, AppModule } from '@/app/app-context';
import type { RelatedAsset } from '@/types';
import type { TheaterPostureSummary } from '@/services/military-surge';
import {
  MapContainer,
  NewsPanel,
  MarketPanel,
  HeatmapPanel,
  CommoditiesPanel,
  CryptoPanel,
  PredictionPanel,
  MonitorPanel,
  EconomicPanel,
  GdeltIntelPanel,
  LiveNewsPanel,
  LiveWebcamsPanel,
  CIIPanel,
  CascadePanel,
  StrategicRiskPanel,
  StrategicPosturePanel,
  TechEventsPanel,
  ServiceStatusPanel,
  RuntimeConfigPanel,
  InsightsPanel,
  MacroSignalsPanel,
  ETFFlowsPanel,
  StablecoinPanel,
  UcdpEventsPanel,
  InvestmentsPanel,
  TradePolicyPanel,
  SupplyChainPanel,
  GulfEconomiesPanel,
  WorldClockPanel,
  AirlineIntelPanel,
  AviationCommandBar,
} from '@/components';
import { SatelliteFiresPanel } from '@/components/SatelliteFiresPanel';
import { focusInvestmentOnMap } from '@/services/investments-focus';
import { debounce, saveToStorage, loadFromStorage } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';
import {
  FEEDS,
  INTEL_SOURCES,
  DEFAULT_PANELS,
  STORAGE_KEYS,
  SITE_VARIANT,
} from '@/config';
import { BETA_MODE } from '@/config/beta';
import { t } from '@/services/i18n';
import { getCurrentTheme } from '@/utils';
import { trackCriticalBannerAction } from '@/services/analytics';

export interface PanelLayoutCallbacks {
  openCountryStory: (code: string, name: string) => void;
  openCountryBrief: (code: string) => void;
  loadAllData: () => Promise<void>;
  updateMonitorResults: () => void;
  loadSecurityAdvisories?: () => Promise<void>;
}

export class PanelLayoutManager implements AppModule {
  private ctx: AppContext;
  private callbacks: PanelLayoutCallbacks;
  private panelDragCleanupHandlers: Array<() => void> = [];
  private criticalBannerEl: HTMLElement | null = null;
  private aviationCommandBar: AviationCommandBar | null = null;
  private readonly applyTimeRangeFilterDebounced: (() => void) & { cancel(): void };

  constructor(ctx: AppContext, callbacks: PanelLayoutCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.applyTimeRangeFilterDebounced = debounce(() => {
      this.applyTimeRangeFilterToNewsPanels();
    }, 120);
  }

  init(): void {
    this.renderLayout();
  }

  destroy(): void {
    this.applyTimeRangeFilterDebounced.cancel();
    this.panelDragCleanupHandlers.forEach((cleanup) => cleanup());
    this.panelDragCleanupHandlers = [];
    if (this.criticalBannerEl) {
      this.criticalBannerEl.remove();
      this.criticalBannerEl = null;
    }
    // Clean up happy variant panels
    this.ctx.tvMode?.destroy();
    this.ctx.tvMode = null;
    this.ctx.countersPanel?.destroy();
    this.ctx.progressPanel?.destroy();
    this.ctx.breakthroughsPanel?.destroy();
    this.ctx.heroPanel?.destroy();
    this.ctx.digestPanel?.destroy();
    this.ctx.speciesPanel?.destroy();
    this.ctx.renewablePanel?.destroy();

    // Clean up aviation components
    this.aviationCommandBar?.destroy();
    this.aviationCommandBar = null;
    this.ctx.panels['airline-intel']?.destroy();

    window.removeEventListener('resize', this.ensureCorrectZones);
  }

  renderLayout(): void {
    this.ctx.container.innerHTML = `
      <div class="header">
        <div class="header-left">
          <button class="hamburger-btn" id="hamburgerBtn" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span class="logo">AEGIS COMMAND SYSTEM</span><span class="logo-mobile">AEGIS</span>${BETA_MODE ? '<span class="beta-badge">BETA</span>' : ''}
          <button class="mobile-settings-btn" id="mobileSettingsBtn" title="${t('header.settings')}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <div class="region-selector">
            <select id="regionSelect" class="region-select">
              <option value="global">${t('components.deckgl.views.global')}</option>
              <option value="america">${t('components.deckgl.views.americas')}</option>
              <option value="mena">${t('components.deckgl.views.mena')}</option>
              <option value="eu">${t('components.deckgl.views.europe')}</option>
              <option value="asia">${t('components.deckgl.views.asia')}</option>
              <option value="latam">${t('components.deckgl.views.latam')}</option>
              <option value="africa">${t('components.deckgl.views.africa')}</option>
              <option value="oceania">${t('components.deckgl.views.oceania')}</option>
            </select>
          </div>
          <button class="mobile-search-btn" id="mobileSearchBtn" aria-label="${t('header.search')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <div class="header-right">
          <button class="search-btn" id="searchBtn"><kbd>⌘K</kbd> ${t('header.search')}</button>
          ${this.ctx.isDesktopApp ? '' : `<button class="fullscreen-btn" id="fullscreenBtn" title="${t('header.fullscreen')}">⛶</button>`}
          ${SITE_VARIANT === 'happy' ? `<button class="tv-mode-btn" id="tvModeBtn" title="TV Mode (Shift+T)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></button>` : ''}
          <span id="unifiedSettingsMount"></span>
        </div>
      </div>
      <div class="mobile-menu-overlay" id="mobileMenuOverlay"></div>
      <nav class="mobile-menu" id="mobileMenu">
        <div class="mobile-menu-header">
          <span class="mobile-menu-title">AEGIS COMMAND</span>
          <button class="mobile-menu-close" id="mobileMenuClose" aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="mobile-menu-divider"></div>
        ${(() => {
        const variants = [
          { key: 'full', icon: '🌍', label: t('header.world') },
          { key: 'tech', icon: '💻', label: t('header.tech') },
          { key: 'finance', icon: '📈', label: t('header.finance') },
        ];
        if (SITE_VARIANT === 'happy') variants.push({ key: 'happy', icon: '☀️', label: 'Good News' });
        return variants.map(v =>
          `<button class="mobile-menu-item mobile-menu-variant ${v.key === SITE_VARIANT ? 'active' : ''}" data-variant="${v.key}">
            <span class="mobile-menu-item-icon">${v.icon}</span>
            <span class="mobile-menu-item-label">${v.label}</span>
            ${v.key === SITE_VARIANT ? '<span class="mobile-menu-check">✓</span>' : ''}
          </button>`
        ).join('');
      })()}
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuRegion">
          <span class="mobile-menu-item-icon">🌐</span>
          <span class="mobile-menu-item-label">${t('components.deckgl.views.global')}</span>
          <span class="mobile-menu-chevron">▸</span>
        </button>
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuSettings">
          <span class="mobile-menu-item-icon">⚙️</span>
          <span class="mobile-menu-item-label">${t('header.settings')}</span>
        </button>
        <button class="mobile-menu-item" id="mobileMenuTheme">
          <span class="mobile-menu-item-icon">${getCurrentTheme() === 'dark' ? '☀️' : '🌙'}</span>
          <span class="mobile-menu-item-label">${getCurrentTheme() === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <a class="mobile-menu-item" href="https://x.com/eliehabib" target="_blank" rel="noopener">
          <span class="mobile-menu-item-icon"><svg class="x-logo" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></span>
          <span class="mobile-menu-item-label">@eliehabib</span>
        </a>
        <div class="mobile-menu-divider"></div>
        <div class="mobile-menu-version">v${__APP_VERSION__}</div>
      </nav>
      <div class="region-sheet-backdrop" id="regionSheetBackdrop"></div>
      <div class="region-bottom-sheet" id="regionBottomSheet">
        <div class="region-sheet-header">${t('header.selectRegion')}</div>
        <div class="region-sheet-divider"></div>
        ${[
        { value: 'global', label: t('components.deckgl.views.global') },
        { value: 'america', label: t('components.deckgl.views.americas') },
        { value: 'mena', label: t('components.deckgl.views.mena') },
        { value: 'eu', label: t('components.deckgl.views.europe') },
        { value: 'asia', label: t('components.deckgl.views.asia') },
        { value: 'latam', label: t('components.deckgl.views.latam') },
        { value: 'africa', label: t('components.deckgl.views.africa') },
        { value: 'oceania', label: t('components.deckgl.views.oceania') },
      ].map(r =>
        `<button class="region-sheet-option ${r.value === 'global' ? 'active' : ''}" data-region="${r.value}">
          <span>${r.label}</span>
          <span class="region-sheet-check">${r.value === 'global' ? '✓' : ''}</span>
        </button>`
      ).join('')}
      </div>
      <div class="main-content">
        <aside class="live-feed-sidebar" id="liveFeedSidebar"></aside>
        <div class="main-content-inner">
        <div class="map-section" id="mapSection">
          <div class="panel-header">
            <div class="panel-header-left">
              <span class="panel-title">${SITE_VARIANT === 'tech' ? t('panels.techMap') : SITE_VARIANT === 'happy' ? 'Good News Map' : t('panels.map')}</span>
            </div>
            <span class="header-clock" id="headerClock" translate="no"></span>
            <div style="display:flex;align-items:center;gap:2px">
              <div class="map-dimension-toggle" id="mapDimensionToggle">
                <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe' ? '' : ' active'}" data-mode="flat" title="2D Map">2D</button>
                <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe' ? ' active' : ''}" data-mode="globe" title="3D Globe">3D</button>
              </div>
              <button class="map-pin-btn" id="mapFullscreenBtn" title="Fullscreen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
              </button>
              <button class="map-pin-btn" id="mapPinBtn" title="${t('header.pinMap')}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v1a1 1 0 001 1 1 1 0 011 1v3.76z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="map-container" id="mapContainer"></div>
          ${SITE_VARIANT === 'happy' ? '<button class="tv-exit-btn" id="tvExitBtn">Exit TV Mode</button>' : ''}
          <div class="map-resize-handle" id="mapResizeHandle"></div>
          <div class="command-console" id="commandConsole">
            <div class="command-console-header">
              <div class="command-console-header-left">
                <span class="command-console-title">COMMAND CONSOLE</span>
                <span class="command-console-subtitle">Target: INT-004 // NON-KINETIC</span>
              </div>
              <button class="command-console-coa-btn" id="commandCoaBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                GENERATE COA
              </button>
            </div>
            <div class="command-console-body">
              <div class="command-console-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
                <span>Awaiting Command Input</span>
              </div>
            </div>
          </div>
        </div>
        <button class="search-mobile-fab" id="searchMobileFab" aria-label="Search">\u{1F50D}</button>
        </div>
        <aside class="right-sidebar" id="rightSidebar">
          <div class="right-sidebar-header">
            <div class="right-sidebar-tabs">
              <button class="right-tab right-tab--active" data-tab="chat">CHAT</button>
              <button class="right-tab" data-tab="intel">${t('settings.sectionIntelligence')}</button>
            </div>
            <button class="right-sidebar-toggle" id="rightSidebarToggle" title="Toggle sidebar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
          <div class="right-tab-content right-tab-content--active" id="chatContent"></div>
          <div class="right-tab-content" id="intelContent">
            <div class="panels-grid" id="panelsGrid"></div>
          </div>
        </aside>
      </div>
    `;

    this.createPanels();
    this.setupRightSidebar();

    if (this.ctx.isMobile) {
      this.setupMobileMapToggle();
    }
  }

  private setupRightSidebar(): void {
    const sidebar = document.getElementById('rightSidebar');
    const toggle = document.getElementById('rightSidebarToggle');
    if (!sidebar || !toggle) return;

    // Restore collapsed state
    const collapsed = loadFromStorage<boolean>('worldmonitor-right-collapsed', false);
    if (collapsed) sidebar.classList.add('collapsed');

    // Restore active tab
    const savedTab = loadFromStorage<string>('worldmonitor-right-tab', 'chat');
    if (savedTab !== 'chat') {
      this.switchRightTab(sidebar, savedTab);
    }

    // Collapse toggle
    toggle.addEventListener('click', () => {
      const isCollapsed = sidebar.classList.toggle('collapsed');
      saveToStorage('worldmonitor-right-collapsed', isCollapsed);

      const svg = toggle.querySelector('svg polyline');
      if (svg) svg.setAttribute('points', isCollapsed ? '15 18 9 12 15 6' : '9 18 15 12 9 6');
    });

    // Tab switching
    sidebar.querySelector('.right-sidebar-tabs')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.right-tab');
      if (!btn || btn.classList.contains('right-tab--active')) return;
      const tab = btn.dataset['tab'];
      if (tab) {
        this.switchRightTab(sidebar, tab);
        saveToStorage('worldmonitor-right-tab', tab);
      }
    });
  }

  private switchRightTab(sidebar: HTMLElement, tab: string): void {
    sidebar.querySelectorAll('.right-tab').forEach(btn => {
      btn.classList.toggle('right-tab--active', (btn as HTMLElement).dataset['tab'] === tab);
    });
    sidebar.querySelectorAll('.right-tab-content').forEach(content => {
      const id = content.id;
      const isActive = (tab === 'intel' && id === 'intelContent') ||
                       (tab === 'chat' && id === 'chatContent');
      content.classList.toggle('right-tab-content--active', isActive);
    });
  }

  private setupMobileMapToggle(): void {
    const mapSection = document.getElementById('mapSection');
    const headerLeft = mapSection?.querySelector('.panel-header-left');
    if (!mapSection || !headerLeft) return;

    const stored = localStorage.getItem('mobile-map-collapsed');
    const collapsed = stored === 'true';
    if (collapsed) mapSection.classList.add('collapsed');

    const updateBtn = (btn: HTMLButtonElement, isCollapsed: boolean) => {
      btn.textContent = isCollapsed ? `▶ ${t('components.map.showMap')}` : `▼ ${t('components.map.hideMap')}`;
    };

    const btn = document.createElement('button');
    btn.className = 'map-collapse-btn';
    updateBtn(btn, collapsed);
    headerLeft.after(btn);

    btn.addEventListener('click', () => {
      const isCollapsed = mapSection.classList.toggle('collapsed');
      updateBtn(btn, isCollapsed);
      localStorage.setItem('mobile-map-collapsed', String(isCollapsed));
      if (!isCollapsed) window.dispatchEvent(new Event('resize'));
    });
  }

  renderCriticalBanner(postures: TheaterPostureSummary[]): void {
    if (this.ctx.isMobile) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
      }
      document.body.classList.remove('has-critical-banner');
      return;
    }

    const dismissedAt = sessionStorage.getItem('banner-dismissed');
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < 30 * 60 * 1000) {
      return;
    }

    const critical = postures.filter(
      (p) => p.postureLevel === 'critical' || (p.postureLevel === 'elevated' && p.strikeCapable)
    );

    if (critical.length === 0) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
        document.body.classList.remove('has-critical-banner');
      }
      return;
    }

    const top = critical[0]!;
    const isCritical = top.postureLevel === 'critical';

    if (!this.criticalBannerEl) {
      this.criticalBannerEl = document.createElement('div');
      this.criticalBannerEl.className = 'critical-posture-banner';
      const header = document.querySelector('.header');
      if (header) header.insertAdjacentElement('afterend', this.criticalBannerEl);
    }

    document.body.classList.add('has-critical-banner');
    this.criticalBannerEl.className = `critical-posture-banner ${isCritical ? 'severity-critical' : 'severity-elevated'}`;
    this.criticalBannerEl.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">${isCritical ? '🚨' : '⚠️'}</span>
        <span class="banner-headline">${escapeHtml(top.headline)}</span>
        <span class="banner-stats">${top.totalAircraft} aircraft • ${escapeHtml(top.summary)}</span>
        ${top.strikeCapable ? '<span class="banner-strike">STRIKE CAPABLE</span>' : ''}
      </div>
      <button class="banner-view" data-lat="${top.centerLat}" data-lon="${top.centerLon}">View Region</button>
      <button class="banner-dismiss">×</button>
    `;

    this.criticalBannerEl.querySelector('.banner-view')?.addEventListener('click', () => {
      console.log('[Banner] View Region clicked:', top.theaterId, 'lat:', top.centerLat, 'lon:', top.centerLon);
      trackCriticalBannerAction('view', top.theaterId);
      if (typeof top.centerLat === 'number' && typeof top.centerLon === 'number') {
        this.ctx.map?.setCenter(top.centerLat, top.centerLon, 4);
      } else {
        console.error('[Banner] Missing coordinates for', top.theaterId);
      }
    });

    this.criticalBannerEl.querySelector('.banner-dismiss')?.addEventListener('click', () => {
      trackCriticalBannerAction('dismiss', top.theaterId);
      this.criticalBannerEl?.classList.add('dismissed');
      document.body.classList.remove('has-critical-banner');
      sessionStorage.setItem('banner-dismissed', Date.now().toString());
    });
  }

  applyPanelSettings(): void {
    Object.entries(this.ctx.panelSettings).forEach(([key, config]) => {
      if (key === 'map') {
        const mapSection = document.getElementById('mapSection');
        if (mapSection) {
          mapSection.classList.toggle('hidden', !config.enabled);
        }
        return;
      }
      const panel = this.ctx.panels[key];
      panel?.toggle(config.enabled);
    });
  }

  private createPanels(): void {
    const panelsGrid = document.getElementById('panelsGrid')!;

    const mapContainer = document.getElementById('mapContainer') as HTMLElement;
    const preferGlobe = loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe';
    this.ctx.map = new MapContainer(mapContainer, {
      zoom: this.ctx.isMobile ? 2.5 : 1.0,
      pan: { x: 0, y: 0 },
      view: this.ctx.isMobile ? this.ctx.resolvedLocation : 'global',
      layers: this.ctx.mapLayers,
      timeRange: '7d',
    }, preferGlobe);

    this.ctx.map.initEscalationGetters();
    this.ctx.currentTimeRange = this.ctx.map.getTimeRange();

    const politicsPanel = new NewsPanel('politics', t('panels.politics'));
    this.attachRelatedAssetHandlers(politicsPanel);
    this.ctx.newsPanels['politics'] = politicsPanel;
    this.ctx.panels['politics'] = politicsPanel;

    const techPanel = new NewsPanel('tech', t('panels.tech'));
    this.attachRelatedAssetHandlers(techPanel);
    this.ctx.newsPanels['tech'] = techPanel;
    this.ctx.panels['tech'] = techPanel;

    const financePanel = new NewsPanel('finance', t('panels.finance'));
    this.attachRelatedAssetHandlers(financePanel);
    this.ctx.newsPanels['finance'] = financePanel;
    this.ctx.panels['finance'] = financePanel;

    const heatmapPanel = new HeatmapPanel();
    this.ctx.panels['heatmap'] = heatmapPanel;

    const marketsPanel = new MarketPanel();
    this.ctx.panels['markets'] = marketsPanel;

    const monitorPanel = new MonitorPanel(this.ctx.monitors);
    this.ctx.panels['monitors'] = monitorPanel;
    monitorPanel.onChanged((monitors) => {
      this.ctx.monitors = monitors;
      saveToStorage(STORAGE_KEYS.monitors, monitors);
      this.callbacks.updateMonitorResults();
    });

    const commoditiesPanel = new CommoditiesPanel();
    this.ctx.panels['commodities'] = commoditiesPanel;

    const predictionPanel = new PredictionPanel();
    this.ctx.panels['polymarket'] = predictionPanel;

    const govPanel = new NewsPanel('gov', t('panels.gov'));
    this.attachRelatedAssetHandlers(govPanel);
    this.ctx.newsPanels['gov'] = govPanel;
    this.ctx.panels['gov'] = govPanel;

    const intelPanel = new NewsPanel('intel', t('panels.intel'));
    this.attachRelatedAssetHandlers(intelPanel);
    this.ctx.newsPanels['intel'] = intelPanel;
    this.ctx.panels['intel'] = intelPanel;

    const cryptoPanel = new CryptoPanel();
    this.ctx.panels['crypto'] = cryptoPanel;

    const middleeastPanel = new NewsPanel('middleeast', t('panels.middleeast'));
    this.attachRelatedAssetHandlers(middleeastPanel);
    this.ctx.newsPanels['middleeast'] = middleeastPanel;
    this.ctx.panels['middleeast'] = middleeastPanel;

    const layoffsPanel = new NewsPanel('layoffs', t('panels.layoffs'));
    this.attachRelatedAssetHandlers(layoffsPanel);
    this.ctx.newsPanels['layoffs'] = layoffsPanel;
    this.ctx.panels['layoffs'] = layoffsPanel;

    const aiPanel = new NewsPanel('ai', t('panels.ai'));
    this.attachRelatedAssetHandlers(aiPanel);
    this.ctx.newsPanels['ai'] = aiPanel;
    this.ctx.panels['ai'] = aiPanel;

    const startupsPanel = new NewsPanel('startups', t('panels.startups'));
    this.attachRelatedAssetHandlers(startupsPanel);
    this.ctx.newsPanels['startups'] = startupsPanel;
    this.ctx.panels['startups'] = startupsPanel;

    const vcblogsPanel = new NewsPanel('vcblogs', t('panels.vcblogs'));
    this.attachRelatedAssetHandlers(vcblogsPanel);
    this.ctx.newsPanels['vcblogs'] = vcblogsPanel;
    this.ctx.panels['vcblogs'] = vcblogsPanel;

    const regionalStartupsPanel = new NewsPanel('regionalStartups', t('panels.regionalStartups'));
    this.attachRelatedAssetHandlers(regionalStartupsPanel);
    this.ctx.newsPanels['regionalStartups'] = regionalStartupsPanel;
    this.ctx.panels['regionalStartups'] = regionalStartupsPanel;

    const unicornsPanel = new NewsPanel('unicorns', t('panels.unicorns'));
    this.attachRelatedAssetHandlers(unicornsPanel);
    this.ctx.newsPanels['unicorns'] = unicornsPanel;
    this.ctx.panels['unicorns'] = unicornsPanel;

    const acceleratorsPanel = new NewsPanel('accelerators', t('panels.accelerators'));
    this.attachRelatedAssetHandlers(acceleratorsPanel);
    this.ctx.newsPanels['accelerators'] = acceleratorsPanel;
    this.ctx.panels['accelerators'] = acceleratorsPanel;

    const fundingPanel = new NewsPanel('funding', t('panels.funding'));
    this.attachRelatedAssetHandlers(fundingPanel);
    this.ctx.newsPanels['funding'] = fundingPanel;
    this.ctx.panels['funding'] = fundingPanel;

    const producthuntPanel = new NewsPanel('producthunt', t('panels.producthunt'));
    this.attachRelatedAssetHandlers(producthuntPanel);
    this.ctx.newsPanels['producthunt'] = producthuntPanel;
    this.ctx.panels['producthunt'] = producthuntPanel;

    const securityPanel = new NewsPanel('security', t('panels.security'));
    this.attachRelatedAssetHandlers(securityPanel);
    this.ctx.newsPanels['security'] = securityPanel;
    this.ctx.panels['security'] = securityPanel;

    const policyPanel = new NewsPanel('policy', t('panels.policy'));
    this.attachRelatedAssetHandlers(policyPanel);
    this.ctx.newsPanels['policy'] = policyPanel;
    this.ctx.panels['policy'] = policyPanel;

    const hardwarePanel = new NewsPanel('hardware', t('panels.hardware'));
    this.attachRelatedAssetHandlers(hardwarePanel);
    this.ctx.newsPanels['hardware'] = hardwarePanel;
    this.ctx.panels['hardware'] = hardwarePanel;

    const cloudPanel = new NewsPanel('cloud', t('panels.cloud'));
    this.attachRelatedAssetHandlers(cloudPanel);
    this.ctx.newsPanels['cloud'] = cloudPanel;
    this.ctx.panels['cloud'] = cloudPanel;

    const devPanel = new NewsPanel('dev', t('panels.dev'));
    this.attachRelatedAssetHandlers(devPanel);
    this.ctx.newsPanels['dev'] = devPanel;
    this.ctx.panels['dev'] = devPanel;

    const githubPanel = new NewsPanel('github', t('panels.github'));
    this.attachRelatedAssetHandlers(githubPanel);
    this.ctx.newsPanels['github'] = githubPanel;
    this.ctx.panels['github'] = githubPanel;

    const ipoPanel = new NewsPanel('ipo', t('panels.ipo'));
    this.attachRelatedAssetHandlers(ipoPanel);
    this.ctx.newsPanels['ipo'] = ipoPanel;
    this.ctx.panels['ipo'] = ipoPanel;

    const thinktanksPanel = new NewsPanel('thinktanks', t('panels.thinktanks'));
    this.attachRelatedAssetHandlers(thinktanksPanel);
    this.ctx.newsPanels['thinktanks'] = thinktanksPanel;
    this.ctx.panels['thinktanks'] = thinktanksPanel;

    const economicPanel = new EconomicPanel();
    this.ctx.panels['economic'] = economicPanel;

    if (SITE_VARIANT === 'full' || SITE_VARIANT === 'finance') {
      const tradePolicyPanel = new TradePolicyPanel();
      this.ctx.panels['trade-policy'] = tradePolicyPanel;

      const supplyChainPanel = new SupplyChainPanel();
      this.ctx.panels['supply-chain'] = supplyChainPanel;
    }

    const africaPanel = new NewsPanel('africa', t('panels.africa'));
    this.attachRelatedAssetHandlers(africaPanel);
    this.ctx.newsPanels['africa'] = africaPanel;
    this.ctx.panels['africa'] = africaPanel;

    const latamPanel = new NewsPanel('latam', t('panels.latam'));
    this.attachRelatedAssetHandlers(latamPanel);
    this.ctx.newsPanels['latam'] = latamPanel;
    this.ctx.panels['latam'] = latamPanel;

    const asiaPanel = new NewsPanel('asia', t('panels.asia'));
    this.attachRelatedAssetHandlers(asiaPanel);
    this.ctx.newsPanels['asia'] = asiaPanel;
    this.ctx.panels['asia'] = asiaPanel;

    const energyPanel = new NewsPanel('energy', t('panels.energy'));
    this.attachRelatedAssetHandlers(energyPanel);
    this.ctx.newsPanels['energy'] = energyPanel;
    this.ctx.panels['energy'] = energyPanel;

    for (const key of Object.keys(FEEDS)) {
      if (this.ctx.newsPanels[key]) continue;
      if (!Array.isArray((FEEDS as Record<string, unknown>)[key])) continue;
      const panelKey = this.ctx.panels[key] && !this.ctx.newsPanels[key] ? `${key}-news` : key;
      if (this.ctx.panels[panelKey]) continue;
      const panelConfig = DEFAULT_PANELS[panelKey] ?? DEFAULT_PANELS[key];
      const label = panelConfig?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
      const panel = new NewsPanel(panelKey, label);
      this.attachRelatedAssetHandlers(panel);
      this.ctx.newsPanels[key] = panel;
      this.ctx.panels[panelKey] = panel;
    }

    if (SITE_VARIANT === 'full') {
      const gdeltIntelPanel = new GdeltIntelPanel();
      this.ctx.panels['gdelt-intel'] = gdeltIntelPanel;

      if (this.ctx.isDesktopApp) {
        import('@/components/DeductionPanel').then(({ DeductionPanel }) => {
          const deductionPanel = new DeductionPanel(() => this.ctx.allNews);
          this.ctx.panels['deduction'] = deductionPanel;
          const el = deductionPanel.getElement();
          this.makeDraggable(el, 'deduction');
          const grid = document.getElementById('panelsGrid');
          if (grid) {
            const gdeltEl = this.ctx.panels['gdelt-intel']?.getElement();
            if (gdeltEl?.nextSibling) {
              grid.insertBefore(el, gdeltEl.nextSibling);
            } else {
              grid.appendChild(el);
            }
          }
        });
      }

      const ciiPanel = new CIIPanel();
      ciiPanel.setShareStoryHandler((code, name) => {
        this.callbacks.openCountryStory(code, name);
      });
      ciiPanel.setCountryClickHandler((code) => {
        this.callbacks.openCountryBrief(code);
      });
      this.ctx.panels['cii'] = ciiPanel;

      const cascadePanel = new CascadePanel();
      this.ctx.panels['cascade'] = cascadePanel;

      const satelliteFiresPanel = new SatelliteFiresPanel();
      this.ctx.panels['satellite-fires'] = satelliteFiresPanel;

      const strategicRiskPanel = new StrategicRiskPanel();
      strategicRiskPanel.setLocationClickHandler((lat, lon) => {
        this.ctx.map?.setCenter(lat, lon, 4);
      });
      this.ctx.panels['strategic-risk'] = strategicRiskPanel;

      const strategicPosturePanel = new StrategicPosturePanel(() => this.ctx.allNews);
      strategicPosturePanel.setLocationClickHandler((lat, lon) => {
        console.log('[App] StrategicPosture handler called:', { lat, lon, hasMap: !!this.ctx.map });
        this.ctx.map?.setCenter(lat, lon, 4);
      });
      this.ctx.panels['strategic-posture'] = strategicPosturePanel;

      const ucdpEventsPanel = new UcdpEventsPanel();
      ucdpEventsPanel.setEventClickHandler((lat, lon) => {
        this.ctx.map?.setCenter(lat, lon, 5);
      });
      this.ctx.panels['ucdp-events'] = ucdpEventsPanel;

      this.lazyPanel('displacement', () =>
        import('@/components/DisplacementPanel').then(m => {
          const p = new m.DisplacementPanel();
          p.setCountryClickHandler((lat: number, lon: number) => { this.ctx.map?.setCenter(lat, lon, 4); });
          return p;
        }),
      );

      this.lazyPanel('climate', () =>
        import('@/components/ClimateAnomalyPanel').then(m => {
          const p = new m.ClimateAnomalyPanel();
          p.setZoneClickHandler((lat: number, lon: number) => { this.ctx.map?.setCenter(lat, lon, 4); });
          return p;
        }),
      );

      this.lazyPanel('population-exposure', () =>
        import('@/components/PopulationExposurePanel').then(m => new m.PopulationExposurePanel()),
      );

      this.lazyPanel('security-advisories', () =>
        import('@/components/SecurityAdvisoriesPanel').then(m => {
          const p = new m.SecurityAdvisoriesPanel();
          p.setRefreshHandler(() => { void this.callbacks.loadSecurityAdvisories?.(); });
          return p;
        }),
      );

      this.lazyPanel('oref-sirens', () =>
        import('@/components/OrefSirensPanel').then(m => new m.OrefSirensPanel()),
      );

      this.lazyPanel('telegram-intel', () =>
        import('@/components/TelegramIntelPanel').then(m => new m.TelegramIntelPanel()),
      );
    }

    if (SITE_VARIANT === 'finance') {
      const investmentsPanel = new InvestmentsPanel((inv) => {
        focusInvestmentOnMap(this.ctx.map, this.ctx.mapLayers, inv.lat, inv.lon);
      });
      this.ctx.panels['gcc-investments'] = investmentsPanel;

      const gulfEconomiesPanel = new GulfEconomiesPanel();
      this.ctx.panels['gulf-economies'] = gulfEconomiesPanel;
    }

    this.ctx.panels['world-clock'] = new WorldClockPanel();

    // Airline Intelligence panel (non-happy variants)
    if (SITE_VARIANT !== 'happy') {
      this.ctx.panels['airline-intel'] = new AirlineIntelPanel();
      // Launch the Ctrl+J command bar (attaches global keydown listener)
      this.aviationCommandBar = new AviationCommandBar();
    }

    if (SITE_VARIANT !== 'happy') {
      if (!this.ctx.panels['gulf-economies']) {
        const gulfEconomiesPanel = new GulfEconomiesPanel();
        this.ctx.panels['gulf-economies'] = gulfEconomiesPanel;
      }

      const liveNewsPanel = new LiveNewsPanel();
      this.ctx.panels['live-news'] = liveNewsPanel;

      const liveWebcamsPanel = new LiveWebcamsPanel();
      this.ctx.panels['live-webcams'] = liveWebcamsPanel;

      this.ctx.panels['events'] = new TechEventsPanel('events', () => this.ctx.allNews);

      const serviceStatusPanel = new ServiceStatusPanel();
      this.ctx.panels['service-status'] = serviceStatusPanel;

      this.lazyPanel('tech-readiness', () =>
        import('@/components/TechReadinessPanel').then(m => new m.TechReadinessPanel()),
      );

      this.ctx.panels['macro-signals'] = new MacroSignalsPanel();
      this.ctx.panels['etf-flows'] = new ETFFlowsPanel();
      this.ctx.panels['stablecoins'] = new StablecoinPanel();
    }

    if (this.ctx.isDesktopApp) {
      const runtimeConfigPanel = new RuntimeConfigPanel({ mode: 'alert' });
      this.ctx.panels['runtime-config'] = runtimeConfigPanel;
    }

    const insightsPanel = new InsightsPanel();
    this.ctx.panels['insights'] = insightsPanel;

    // Global Giving panel (all variants)
    this.lazyPanel('giving', () =>
      import('@/components/GivingPanel').then(m => new m.GivingPanel()),
    );

    // Happy variant panels (lazy-loaded — only relevant for happy variant)
    if (SITE_VARIANT === 'happy') {
      this.lazyPanel('positive-feed', () =>
        import('@/components/PositiveNewsFeedPanel').then(m => {
          const p = new m.PositiveNewsFeedPanel();
          this.ctx.positivePanel = p;
          return p;
        }),
      );

      this.lazyPanel('counters', () =>
        import('@/components/CountersPanel').then(m => {
          const p = new m.CountersPanel();
          p.startTicking();
          this.ctx.countersPanel = p;
          return p;
        }),
      );

      this.lazyPanel('progress', () =>
        import('@/components/ProgressChartsPanel').then(m => {
          const p = new m.ProgressChartsPanel();
          this.ctx.progressPanel = p;
          return p;
        }),
      );

      this.lazyPanel('breakthroughs', () =>
        import('@/components/BreakthroughsTickerPanel').then(m => {
          const p = new m.BreakthroughsTickerPanel();
          this.ctx.breakthroughsPanel = p;
          return p;
        }),
      );

      this.lazyPanel('spotlight', () =>
        import('@/components/HeroSpotlightPanel').then(m => {
          const p = new m.HeroSpotlightPanel();
          p.onLocationRequest = (lat: number, lon: number) => {
            this.ctx.map?.setCenter(lat, lon, 4);
            this.ctx.map?.flashLocation(lat, lon, 3000);
          };
          this.ctx.heroPanel = p;
          return p;
        }),
      );

      this.lazyPanel('digest', () =>
        import('@/components/GoodThingsDigestPanel').then(m => {
          const p = new m.GoodThingsDigestPanel();
          this.ctx.digestPanel = p;
          return p;
        }),
      );

      this.lazyPanel('species', () =>
        import('@/components/SpeciesComebackPanel').then(m => {
          const p = new m.SpeciesComebackPanel();
          this.ctx.speciesPanel = p;
          return p;
        }),
      );

      this.lazyPanel('renewable', () =>
        import('@/components/RenewableEnergyPanel').then(m => {
          const p = new m.RenewableEnergyPanel();
          this.ctx.renewablePanel = p;
          return p;
        }),
      );
    }

    const defaultOrder = Object.keys(DEFAULT_PANELS).filter(k => k !== 'map');
    const savedOrder = this.getSavedPanelOrder();
    let panelOrder = defaultOrder;
    if (savedOrder.length > 0) {
      const missing = defaultOrder.filter(k => !savedOrder.includes(k));
      const valid = savedOrder.filter(k => defaultOrder.includes(k));

      const monitorsIdx = valid.indexOf('monitors');
      if (monitorsIdx !== -1) valid.splice(monitorsIdx, 1);
      const insertIdx = valid.indexOf('politics') + 1 || 0;
      const newPanels = missing.filter(k => k !== 'monitors');
      valid.splice(insertIdx, 0, ...newPanels);
      if (SITE_VARIANT !== 'happy') {
        valid.push('monitors');
      }
      panelOrder = valid;
    }

    if (SITE_VARIANT !== 'happy') {
      const liveNewsIdx = panelOrder.indexOf('live-news');
      if (liveNewsIdx > 0) {
        panelOrder.splice(liveNewsIdx, 1);
        panelOrder.unshift('live-news');
      }

      const webcamsIdx = panelOrder.indexOf('live-webcams');
      if (webcamsIdx !== -1 && webcamsIdx !== panelOrder.indexOf('live-news') + 1) {
        panelOrder.splice(webcamsIdx, 1);
        const afterNews = panelOrder.indexOf('live-news') + 1;
        panelOrder.splice(afterNews, 0, 'live-webcams');
      }
    }

    if (this.ctx.isDesktopApp) {
      const runtimeIdx = panelOrder.indexOf('runtime-config');
      if (runtimeIdx > 1) {
        panelOrder.splice(runtimeIdx, 1);
        panelOrder.splice(1, 0, 'runtime-config');
      } else if (runtimeIdx === -1) {
        panelOrder.splice(1, 0, 'runtime-config');
      }
    }

    panelOrder.forEach((key: string) => {
      const panel = this.ctx.panels[key];
      if (panel && !panel.getElement().parentElement) {
        const el = panel.getElement();
        this.makeDraggable(el, key);
        panelsGrid.appendChild(el);
      }
    });

    window.addEventListener('resize', () => this.ensureCorrectZones());

    this.ctx.map.onTimeRangeChanged((range) => {
      this.ctx.currentTimeRange = range;
      this.applyTimeRangeFilterDebounced();
    });

    this.applyPanelSettings();
    this.applyInitialUrlState();
  }

  private applyTimeRangeFilterToNewsPanels(): void {
    Object.entries(this.ctx.newsByCategory).forEach(([category, items]) => {
      const panel = this.ctx.newsPanels[category];
      if (!panel) return;
      const filtered = this.filterItemsByTimeRange(items);
      if (filtered.length === 0 && items.length > 0) {
        panel.renderFilteredEmpty(`No items in ${this.getTimeRangeLabel()}`);
        return;
      }
      panel.renderNews(filtered);
    });
  }

  private filterItemsByTimeRange(items: import('@/types').NewsItem[], range: import('@/components').TimeRange = this.ctx.currentTimeRange): import('@/types').NewsItem[] {
    if (range === 'all') return items;
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000, '48h': 48 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000, 'all': Infinity,
    };
    const cutoff = Date.now() - (ranges[range] ?? Infinity);
    return items.filter((item) => {
      const ts = item.pubDate instanceof Date ? item.pubDate.getTime() : new Date(item.pubDate).getTime();
      return Number.isFinite(ts) ? ts >= cutoff : true;
    });
  }

  private getTimeRangeLabel(): string {
    const labels: Record<string, string> = {
      '1h': 'the last hour', '6h': 'the last 6 hours',
      '24h': 'the last 24 hours', '48h': 'the last 48 hours',
      '7d': 'the last 7 days', 'all': 'all time',
    };
    return labels[this.ctx.currentTimeRange] ?? 'the last 7 days';
  }

  private applyInitialUrlState(): void {
    if (!this.ctx.initialUrlState || !this.ctx.map) return;

    const { view, zoom, lat, lon, timeRange, layers } = this.ctx.initialUrlState;

    if (view) {
      this.ctx.map.setView(view);
    }

    if (timeRange) {
      this.ctx.map.setTimeRange(timeRange);
    }

    if (layers) {
      this.ctx.mapLayers = layers;
      saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
      this.ctx.map.setLayers(layers);
    }

    if (lat !== undefined && lon !== undefined) {
      const effectiveZoom = zoom ?? this.ctx.map.getState().zoom;
      if (effectiveZoom > 2) this.ctx.map.setCenter(lat, lon, zoom);
    } else if (!view && zoom !== undefined) {
      this.ctx.map.setZoom(zoom);
    }

    const regionSelect = document.getElementById('regionSelect') as HTMLSelectElement;
    const currentView = this.ctx.map.getState().view;
    if (regionSelect && currentView) {
      regionSelect.value = currentView;
    }
  }

  private getSavedPanelOrder(): string[] {
    try {
      const saved = localStorage.getItem(this.ctx.PANEL_ORDER_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  savePanelOrder(): void {
    const grid = document.getElementById('panelsGrid');
    if (!grid) return;

    const order = Array.from(grid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);

    localStorage.setItem(this.ctx.PANEL_ORDER_KEY, JSON.stringify(order));
  }

  public ensureCorrectZones(): void {
    // No-op: bottom grid was replaced by command console
  }

  private attachRelatedAssetHandlers(panel: NewsPanel): void {
    panel.setRelatedAssetHandlers({
      onRelatedAssetClick: (asset) => this.handleRelatedAssetClick(asset),
      onRelatedAssetsFocus: (assets) => this.ctx.map?.highlightAssets(assets),
      onRelatedAssetsClear: () => this.ctx.map?.highlightAssets(null),
    });
  }

  private handleRelatedAssetClick(asset: RelatedAsset): void {
    if (!this.ctx.map) return;

    switch (asset.type) {
      case 'pipeline':
        this.ctx.map.enableLayer('pipelines');
        this.ctx.mapLayers.pipelines = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerPipelineClick(asset.id);
        break;
      case 'cable':
        this.ctx.map.enableLayer('cables');
        this.ctx.mapLayers.cables = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerCableClick(asset.id);
        break;
      case 'datacenter':
        this.ctx.map.enableLayer('datacenters');
        this.ctx.mapLayers.datacenters = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerDatacenterClick(asset.id);
        break;
      case 'base':
        this.ctx.map.enableLayer('bases');
        this.ctx.mapLayers.bases = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerBaseClick(asset.id);
        break;
      case 'nuclear':
        this.ctx.map.enableLayer('nuclear');
        this.ctx.mapLayers.nuclear = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerNuclearClick(asset.id);
        break;
    }
  }

  private lazyPanel<T extends { getElement(): HTMLElement }>(
    key: string,
    loader: () => Promise<T>,
    setup?: (panel: T) => void,
  ): void {
    loader().then((panel) => {
      this.ctx.panels[key] = panel as unknown as import('@/components/Panel').Panel;
      if (setup) setup(panel);
      const el = panel.getElement();
      this.makeDraggable(el, key);
      const grid = document.getElementById('panelsGrid');
      if (grid) grid.appendChild(el);
    }).catch((err) => {
      console.error(`[panel] failed to lazy-load "${key}"`, err);
    });
  }

  private makeDraggable(el: HTMLElement, key: string): void {
    el.dataset.panel = key;
    let isDragging = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let rafId = 0;
    const DRAG_THRESHOLD = 8;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (el.dataset.resizing === 'true') return;
      if (
        target.classList?.contains('panel-resize-handle') ||
        target.closest?.('.panel-resize-handle') ||
        target.classList?.contains('panel-col-resize-handle') ||
        target.closest?.('.panel-col-resize-handle')
      ) return;
      if (target.closest('button, a, input, select, textarea, .panel-content')) return;

      isDragging = true;
      dragStarted = false;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      if (!dragStarted) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
        dragStarted = true;
        el.classList.add('dragging');
      }
      const cx = e.clientX;
      const cy = e.clientY;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        this.handlePanelDragMove(el, cx, cy);
        rafId = 0;
      });
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (dragStarted) {
        el.classList.remove('dragging');
        this.savePanelOrder();
      }
      dragStarted = false;
    };

    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.panelDragCleanupHandlers.push(() => {
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      isDragging = false;
      dragStarted = false;
      el.classList.remove('dragging');
    });
  }

  private handlePanelDragMove(dragging: HTMLElement, clientX: number, clientY: number): void {
    const grid = document.getElementById('panelsGrid');
    if (!grid) return;

    dragging.style.pointerEvents = 'none';
    const target = document.elementFromPoint(clientX, clientY);
    dragging.style.pointerEvents = '';

    if (!target) return;

    // Check if we are over the panels grid or a panel inside it
    const targetGrid = target.closest('.panels-grid') as HTMLElement | null;
    const targetPanel = target.closest('.panel') as HTMLElement | null;

    if (!targetGrid && !targetPanel) return;

    const currentTargetGrid = targetGrid || (targetPanel ? targetPanel.parentElement as HTMLElement : null);
    if (!currentTargetGrid || currentTargetGrid !== grid) return;

    if (targetPanel && targetPanel !== dragging && !targetPanel.classList.contains('hidden')) {
      const targetRect = targetPanel.getBoundingClientRect();
      const draggingRect = dragging.getBoundingClientRect();

      const children = Array.from(currentTargetGrid.children);
      const dragIdx = children.indexOf(dragging);
      const targetIdx = children.indexOf(targetPanel);

      const sameRow = Math.abs(draggingRect.top - targetRect.top) < 30;
      const targetMid = sameRow
        ? targetRect.left + targetRect.width / 2
        : targetRect.top + targetRect.height / 2;
      const cursorPos = sameRow ? clientX : clientY;

      if (dragIdx === -1) {
        // Moving from one grid to another
        if (cursorPos < targetMid) {
          currentTargetGrid.insertBefore(dragging, targetPanel);
        } else {
          currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
        }
      } else {
        // Reordering within same grid
        if (dragIdx < targetIdx) {
          if (cursorPos > targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
          }
        } else {
          if (cursorPos < targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel);
          }
        }
      }
    } else if (currentTargetGrid !== dragging.parentElement) {
      // Dragging over an empty or near-empty grid zone
      currentTargetGrid.appendChild(dragging);
    }
  }

  getLocalizedPanelName(panelKey: string, fallback: string): string {
    if (panelKey === 'runtime-config') {
      return t('modals.runtimeConfig.title');
    }
    const key = panelKey.replace(/-([a-z])/g, (_match, group: string) => group.toUpperCase());
    const lookup = `panels.${key}`;
    const localized = t(lookup);
    return localized === lookup ? fallback : localized;
  }

  getAllSourceNames(): string[] {
    const sources = new Set<string>();
    Object.values(FEEDS).forEach(feeds => {
      if (feeds) feeds.forEach(f => sources.add(f.name));
    });
    INTEL_SOURCES.forEach(f => sources.add(f.name));
    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }
}
