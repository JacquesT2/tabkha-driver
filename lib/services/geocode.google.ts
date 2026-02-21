import type { Stop } from '@/lib/types';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

export type GeocodeResult = {
    stops: Stop[];
    warnings: Array<{ stopId: string; address: string; fallbackQuery: string }>;
};

/**
 * Geocode a single address using Google Maps Geocoding API
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!GOOGLE_MAPS_API_KEY) {
        throw new Error('GOOGLE_MAPS_API_KEY environment variable is required');
    }

    const url = `${GOOGLE_MAPS_BASE_URL}/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;

    try {
        const res = await fetch(url);

        if (!res.ok) {
            console.error(`[GEOCODE_ERROR] Google Maps API returned ${res.status}`);
            return null;
        }

        const data = await res.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            return {
                lat: location.lat,
                lng: location.lng
            };
        }

        if (data.status === 'ZERO_RESULTS') {
            console.warn(`[GEOCODE_FAILED] No results for address: "${address}"`);
            return null;
        }

        if (data.status === 'REQUEST_DENIED') {
            throw new Error(`Google Maps API request denied: ${data.error_message || 'Check API key and billing'}`);
        }

        console.warn(`[GEOCODE_FAILED] Google Maps API status: ${data.status} for "${address}"`);
        return null;
    } catch (err: any) {
        console.error(`[GEOCODE_ERROR] Error geocoding "${address}":`, err.message);
        return null;
    }
}

/**
 * Geocode stops that don't have coordinates using Google Maps
 */
export async function geocodeStopsIfNeeded(stops: Stop[]): Promise<GeocodeResult> {
    const out: Stop[] = [];
    const warnings: Array<{ stopId: string; address: string; fallbackQuery: string }> = [];

    // Process all stops in parallel (Google has no rate limit like Nominatim)
    const promises = stops.map(async (s) => {
        // If already has coordinates, keep as-is
        if (typeof s.lat === 'number' && typeof s.lng === 'number') {
            return s;
        }

        // If no address, keep without coordinates
        if (!s.address) {
            console.warn(`[GEOCODE_SKIP] Stop ${s.id} missing coordinates and address`);
            return s;
        }

        // Geocode the address
        const result = await geocodeAddress(s.address);

        if (result) {
            return { ...s, lat: result.lat, lng: result.lng };
        } else {
            // Keep stop without coordinates
            return s;
        }
    });

    const results = await Promise.all(promises);
    out.push(...results);

    return { stops: out, warnings };
}
