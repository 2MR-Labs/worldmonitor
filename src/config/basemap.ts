import { Protocol } from 'pmtiles';
import maplibregl from 'maplibre-gl';
import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

const R2_BASE = import.meta.env.VITE_PMTILES_URL ?? '';

const hasTilesUrl = !!R2_BASE;

let registered = false;

export function registerPMTilesProtocol(): void {
  if (registered) return;
  registered = true;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
}

export function buildPMTilesStyle(theme: 'dark' | 'light'): StyleSpecification | null {
  if (!hasTilesUrl) return null;
  const flavor = theme === 'light' ? 'light' : 'dark';
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${flavor}`,
    sources: {
      basemap: {
        type: 'vector',
        url: `pmtiles://${R2_BASE}`,
        attribution: '<a href="https://protomaps.com">Protomaps</a> | <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: layers('basemap', namedFlavor(flavor), { lang: 'en' }) as StyleSpecification['layers'],
  };
}

export const FALLBACK_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
export const FALLBACK_LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';
