import type { Stop } from '@/lib/types';

// Use public Nominatim if self-hosted not available
const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

// Helper to delay between requests (Nominatim rate limit: 1 req/sec)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type AddressComponents = {
  streetNumber?: string;
  streetName?: string;
  postalCode?: string;
  city?: string;
};



/**
 * Attempts to geocode an address query using Nominatim
 */
async function tryGeocodeQuery(query: string, isFallback: boolean = false): Promise<{ lat: number; lng: number } | null> {
  const url = `${NOMINATIM_URL}/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Tabkha-Driver/1.0 (Delivery Route Planner)'
      }
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    // Use the first result (Nominatim sorts by relevance)
    const result = data[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (isFallback && (isNaN(lat) || isNaN(lng))) {
      return null;
    }

    return { lat, lng };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      // eslint-disable-next-line no-console
      console.warn(`[GEOCODE_TIMEOUT] Geocoding timeout for "${query}"`);
    }
    return null;
  }
}

/**
 * Attempts to geocode an address.
 * STRICT MODE: Only attempts the full address. No fallbacks.
 */
export async function tryGeocodeWithFallback(address: string): Promise<{ lat: number; lng: number; usedFallback: boolean; fallbackQuery?: string } | null> {
  // Strict mode: Only try the original address
  const result = await tryGeocodeQuery(address, false);

  if (result) {
    return { ...result, usedFallback: false };
  }

  return null;
}

export type GeocodeResult = {
  stops: Stop[];
  warnings: Array<{ stopId: string; address: string; fallbackQuery: string }>;
};

export async function geocodeStopsIfNeeded(stops: Stop[]): Promise<GeocodeResult> {
  const out: Stop[] = [];
  const warnings: Array<{ stopId: string; address: string; fallbackQuery: string }> = [];

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (typeof s.lat === 'number' && typeof s.lng === 'number') {
      out.push(s);
      continue;
    }
    if (!s.address) {
      // eslint-disable-next-line no-console
      console.warn(`[GEOCODE_SKIP] Stop ${s.id} missing coordinates and address, skipping`);
      continue;
    }

    // Rate limit: wait 1 second between requests for public Nominatim
    if (i > 0 && NOMINATIM_URL.includes('openstreetmap.org')) {
      await delay(1000);
    }

    try {
      const result = await tryGeocodeWithFallback(s.address);

      if (result) {
        out.push({ ...s, lat: result.lat, lng: result.lng });
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[GEOCODE_FAILED] Could not geocode address "${s.address}" for stop ${s.id}`);
        // Keep the stop but without coordinates
        out.push(s);
      }
    } catch (err: any) {
      // Handle network errors and connection issues
      if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed')) {
        // eslint-disable-next-line no-console
        console.error(`[GEOCODE_ERROR] Cannot connect to Nominatim at ${NOMINATIM_URL}. Is the service running? Error: ${err.message || err.code || 'Connection refused'}`);
        throw new Error(`Cannot connect to Nominatim at ${NOMINATIM_URL}. Is the service running?`);
      }
      // For other errors, log and keep the stop without coordinates
      // eslint-disable-next-line no-console
      console.warn(`[GEOCODE_ERROR] Geocoding error for "${s.address}": ${err?.message || String(err)}`);
      out.push(s);
    }
  }
  return { stops: out, warnings };
}

