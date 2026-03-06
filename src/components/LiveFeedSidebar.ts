import type { NewsItem } from '@/types';
import { formatTime } from '@/utils';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { loadFromStorage, saveToStorage } from '@/utils';


const COLLAPSED_KEY = 'worldmonitor-livefeed-collapsed';
const FILTER_KEY = 'worldmonitor-livefeed-filter';
const MAX_ITEMS = 200;
const TOAST_DURATION_MS = 6000;

interface FeedItem extends NewsItem {
  _category: string;
}

interface LiveFeedContext {
  newsByCategory: Record<string, NewsItem[]>;
  map?: { setCenter(lat: number, lon: number, zoom?: number): void } | null;
}

/** Category accent / badge color */
const CATEGORY_COLORS: Record<string, string> = {
  politics:      '#D4A846',
  us:            '#6e8cc8',
  europe:        '#8b7ec8',
  middleeast:    '#c89846',
  africa:        '#c87846',
  latam:         '#46a88c',
  asia:          '#4698b8',
  energy:        '#b8a836',
  gov:           '#6e7a88',
  thinktanks:    '#8878b8',
  intel:         '#c84848',
  'gdelt-intel': '#b83838',
  cascade:       '#c84868',
};

/** Category card background (dark tinted) */
const CATEGORY_BG: Record<string, string> = {
  politics:      '#141810',
  us:            '#0e1220',
  europe:        '#12102a',
  middleeast:    '#181408',
  africa:        '#181008',
  latam:         '#081a16',
  asia:          '#081620',
  energy:        '#161408',
  gov:           '#10141a',
  thinktanks:    '#120e24',
  intel:         '#200e0e',
  'gdelt-intel': '#1e0a0a',
  cascade:       '#200e14',
};

function getCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    politics: 'World',
    us: 'US',
    europe: 'Europe',
    middleeast: 'Middle East',
    africa: 'Africa',
    latam: 'LATAM',
    asia: 'Asia-Pacific',
    energy: 'Energy',
    gov: 'Government',
    thinktanks: 'Think Tanks',
    intel: 'Intel',
    'gdelt-intel': 'Intelligence',
    cascade: 'Infrastructure',
  };
  return labels[cat] ?? cat;
}

export class LiveFeedSidebar {
  private el: HTMLElement;
  private filterEl: HTMLElement;
  private listEl: HTMLElement;
  private ctx: LiveFeedContext;
  private collapsed: boolean;
  private activeFilter: string | null;
  private allItems: FeedItem[] = [];
  private knownTitles = new Set<string>();
  private firstLoad = true;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(mountEl: HTMLElement, ctx: LiveFeedContext) {
    this.ctx = ctx;
    this.collapsed = loadFromStorage<boolean>(COLLAPSED_KEY, false);
    this.activeFilter = loadFromStorage<string | null>(FILTER_KEY, null);
    this.el = mountEl;
    this.filterEl = document.createElement('div');
    this.listEl = document.createElement('div');
    this.render();
    this.bindEvents();
    this.update();
  }

  private render(): void {
    if (this.collapsed) this.el.classList.add('collapsed');

    this.el.innerHTML = `
      <div class="livefeed-header">
        <span class="livefeed-title"><span class="livefeed-dot"></span>LIVE</span>
        <button class="livefeed-toggle" id="liveFeedToggle" title="Toggle sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="${this.collapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'}"/>
          </svg>
        </button>
      </div>
    `;

    this.filterEl.className = 'livefeed-filters';
    this.el.appendChild(this.filterEl);

    this.listEl.className = 'livefeed-list';
    this.el.appendChild(this.listEl);
  }

  private renderFilters(): void {
    const cats = new Set(this.allItems.map(i => i._category));

    const chips = Array.from(cats).map(cat => {
      const label = escapeHtml(getCategoryLabel(cat));
      const color = CATEGORY_COLORS[cat] ?? '#64748b';
      const active = this.activeFilter === cat;
      const cls = active ? 'livefeed-chip livefeed-chip--active' : 'livefeed-chip';
      const style = active
        ? `background:${color};color:#fff`
        : `background:${color}18;color:${color};border-color:${color}40`;
      return `<button class="${cls}" data-cat="${escapeHtml(cat)}" style="${style}">${label}</button>`;
    });

    const allActive = this.activeFilter === null;
    const allCls = allActive ? 'livefeed-chip livefeed-chip--active' : 'livefeed-chip';
    const allStyle = allActive
      ? 'background:#888;color:#fff'
      : 'background:rgba(255,255,255,0.06);color:var(--text-dim)';

    this.filterEl.innerHTML = `<button class="${allCls}" data-cat="__all" style="${allStyle}">All</button>` + chips.join('');
  }

  private bindEvents(): void {
    this.el.querySelector('#liveFeedToggle')?.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.el.classList.toggle('collapsed', this.collapsed);
      saveToStorage(COLLAPSED_KEY, this.collapsed);

      const svg = this.el.querySelector('#liveFeedToggle svg polyline');
      if (svg) svg.setAttribute('points', this.collapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6');
    });

    this.filterEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.livefeed-chip');
      if (!btn) return;
      const cat = btn.dataset['cat'] ?? null;
      if (cat === '__all') {
        this.activeFilter = null;
      } else if (this.activeFilter === cat) {
        this.activeFilter = null; // toggle off
      } else {
        this.activeFilter = cat;
      }
      saveToStorage(FILTER_KEY, this.activeFilter);
      this.renderFilters();
      this.renderFilteredItems();
    });

    this.listEl.addEventListener('click', (e) => {
      const locBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.livefeed-card-location--clickable');
      if (!locBtn) return;
      const lat = parseFloat(locBtn.dataset['lat'] ?? '');
      const lon = parseFloat(locBtn.dataset['lon'] ?? '');
      if (!isNaN(lat) && !isNaN(lon) && this.ctx.map) {
        this.ctx.map.setCenter(lat, lon, 6);
        // Find the matching item to show toast
        const card = locBtn.closest<HTMLElement>('.livefeed-card');
        const title = card?.querySelector('.livefeed-card-title')?.textContent ?? '';
        const source = card?.querySelector('.livefeed-card-source')?.textContent ?? '';
        const item = this.allItems.find(i =>
          i.title === title || i.source === source && i.lat === lat && i.lon === lon
        );
        if (item) this.showNewsToast(item);
      }
    });

    document.addEventListener('wm:news-updated', () => this.update());
  }

  update(): void {
    const allItems: FeedItem[] = [];
    for (const [category, items] of Object.entries(this.ctx.newsByCategory)) {
      for (const item of items) {
        allItems.push({ ...item, _category: category });
      }
    }

    allItems.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

    const seen = new Set<string>();
    const unique: FeedItem[] = [];
    for (const item of allItems) {
      const key = item.title.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
      if (unique.length >= MAX_ITEMS) break;
    }

    // Detect new geo-tagged items (skip first load to avoid centering on stale data)
    if (!this.firstLoad) {
      const newGeoItem = unique.find(item =>
        item.lat !== undefined && item.lon !== undefined &&
        !this.knownTitles.has(item.title.toLowerCase().trim())
      );
      if (newGeoItem && this.ctx.map) {
        this.ctx.map.setCenter(newGeoItem.lat!, newGeoItem.lon!, 6);
        this.showNewsToast(newGeoItem);
      }
    }
    this.firstLoad = false;

    // Update known titles set
    this.knownTitles.clear();
    for (const item of unique) {
      this.knownTitles.add(item.title.toLowerCase().trim());
    }

    this.allItems = unique;
    this.renderFilters();
    this.renderFilteredItems();
  }

  private renderFilteredItems(): void {
    const filtered = this.activeFilter
      ? this.allItems.filter(i => i._category === this.activeFilter)
      : this.allItems;
    this.renderItems(filtered);
  }

  private renderItems(items: FeedItem[]): void {
    if (items.length === 0) {
      this.listEl.innerHTML = '<div class="livefeed-empty">No news in this category</div>';
      return;
    }

    const html = items.map(item => {
      const time = formatTime(item.pubDate);
      const title = escapeHtml(item.title);
      const source = escapeHtml(item.source);
      const url = sanitizeUrl(item.link);
      const color = CATEGORY_COLORS[item._category] ?? '#64748b';
      const bg = CATEGORY_BG[item._category] ?? '#1a1a2e';
      const catLabel = escapeHtml(getCategoryLabel(item._category));
      const alertClass = item.isAlert ? ' livefeed-card--alert' : '';

      const hasGeo = item.locationName && item.lat !== undefined && item.lon !== undefined;
      const locationHtml = item.locationName
        ? `<button class="livefeed-card-location${hasGeo ? ' livefeed-card-location--clickable' : ''}" ${hasGeo ? `data-lat="${item.lat}" data-lon="${item.lon}"` : ''}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${escapeHtml(item.locationName)}</button>`
        : '';

      return `<div class="livefeed-card${alertClass}" style="--cat-color:${color};--cat-bg:${bg}">
        <div class="livefeed-card-row">
          <span class="livefeed-card-badge" style="background:${color};color:#fff">${catLabel}</span>
          <span class="livefeed-card-time">${time}</span>
        </div>
        <div class="livefeed-card-title">${title}</div>
        <div class="livefeed-card-meta">
          <span class="livefeed-card-source">${source}</span>
          ${locationHtml}
          <a class="livefeed-card-link" href="${url}" target="_blank" rel="noopener" title="Open article"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
        </div>
      </div>`;
    }).join('');

    this.listEl.innerHTML = html;
  }

  private showNewsToast(item: FeedItem): void {
    // Remove any existing toast
    document.querySelector('.news-map-toast')?.remove();
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }

    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;

    const color = CATEGORY_COLORS[item._category] ?? '#64748b';
    const catLabel = escapeHtml(getCategoryLabel(item._category));
    const title = escapeHtml(item.title);
    const source = escapeHtml(item.source);
    const location = item.locationName ? escapeHtml(item.locationName) : '';
    const url = sanitizeUrl(item.link);
    const time = formatTime(item.pubDate);

    const toast = document.createElement('div');
    toast.className = 'news-map-toast';
    toast.innerHTML = `
      <div class="news-map-toast-header">
        <span class="news-map-toast-badge" style="background:${color}">${catLabel}</span>
        <span class="news-map-toast-time">${time}</span>
        <button class="news-map-toast-close" title="Close">&times;</button>
      </div>
      <div class="news-map-toast-title">${title}</div>
      <div class="news-map-toast-meta">
        <span class="news-map-toast-source">${source}</span>
        ${location ? `<span class="news-map-toast-location"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${location}</span>` : ''}
        <a class="news-map-toast-link" href="${url}" target="_blank" rel="noopener"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
      </div>
    `;

    toast.querySelector('.news-map-toast-close')?.addEventListener('click', () => {
      toast.classList.add('news-map-toast--exit');
      toast.addEventListener('animationend', () => toast.remove());
    });

    mapContainer.appendChild(toast);
    // Trigger enter animation
    requestAnimationFrame(() => toast.classList.add('news-map-toast--enter'));

    // Auto-dismiss
    this.toastTimer = setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('news-map-toast--exit');
        toast.addEventListener('animationend', () => toast.remove());
      }
    }, TOAST_DURATION_MS);
  }

  destroy(): void {
    document.removeEventListener('wm:news-updated', () => this.update());
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}
