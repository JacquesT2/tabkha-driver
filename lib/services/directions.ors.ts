import type { Stop, OptimizedStop, RouteSegment } from '@/lib/types';

const ORS_API_KEY = process.env.ORS_API_KEY || '';
const ORS_BASE_URL = 'https://api.openrouteservice.org';

export async function getDirectionsPolyline(params: { depot: { lat: number; lng: number }; stops: Stop[] }): Promise<string | null> {
    try {
        if (params.stops.length === 0) {
            return null;
        }

        // Build coordinates: depot + all stops + return to depot
        const coords = [
            [params.depot.lng, params.depot.lat],
            ...params.stops.map(s => [s.lng!, s.lat!]),
            [params.depot.lng, params.depot.lat] // Return to depot
        ];

        return await requestPolyline(coords as [number, number][]);
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[DIRECTIONS] Failed to fetch polyline from ORS:', err?.message || String(err));
        return null;
    }
}

// Get separate polylines for each route segment (depot → stops → depot return)
export async function getSegmentPolylines(params: {
    depot: { lat: number; lng: number };
    orderedStops: OptimizedStop[]
}): Promise<RouteSegment[]> {
    const segments: RouteSegment[] = [];

    // Identify segments by depot returns
    let segmentStart = 0;

    for (let i = 0; i < params.orderedStops.length; i++) {
        if (params.orderedStops[i].isDepotReturn) {
            // End of segment - request polyline for this segment
            const segmentStops = params.orderedStops.slice(segmentStart, i);

            // Build coordinates: depot → delivery stops → depot
            const coords: [number, number][] = [[params.depot.lng, params.depot.lat]];

            // Add delivery stops (exclude depot returns)
            for (const stop of segmentStops) {
                if (!stop.isDepotReturn && stop.lat && stop.lng) {
                    coords.push([stop.lng, stop.lat]);
                }
            }

            // End at depot
            coords.push([params.depot.lng, params.depot.lat]);

            // Request polyline from ORS
            const polyline = await requestPolyline(coords);

            segments.push({
                polyline: polyline || '',
                startStopIndex: segmentStart,
                endStopIndex: i
            });

            segmentStart = i + 1; // Next segment starts after this depot return
        }
    }

    // Handle final segment if there are stops after the last depot return
    if (segmentStart < params.orderedStops.length) {
        const segmentStops = params.orderedStops.slice(segmentStart);
        const coords: [number, number][] = [[params.depot.lng, params.depot.lat]];

        for (const stop of segmentStops) {
            if (!stop.isDepotReturn && stop.lat && stop.lng) {
                coords.push([stop.lng, stop.lat]);
            }
        }

        // Check if last stop is a depot return
        const lastStop = params.orderedStops[params.orderedStops.length - 1];
        if (!lastStop.isDepotReturn) {
            coords.push([params.depot.lng, params.depot.lat]);
        }

        const polyline = await requestPolyline(coords);

        segments.push({
            polyline: polyline || '',
            startStopIndex: segmentStart,
            endStopIndex: params.orderedStops.length - 1
        });
    }

    return segments;
}

async function requestPolyline(coords: [number, number][]): Promise<string | null> {
    try {
        if (coords.length < 2) {
            return null;
        }

        if (!ORS_API_KEY) {
            // eslint-disable-next-line no-console
            console.warn('[DIRECTIONS] ORS_API_KEY not set');
            return null;
        }

        // ORS Directions API v2: POST /v2/directions/{profile}
        // Body: { coordinates: [[lng, lat], ...] }
        const res = await fetch(`${ORS_BASE_URL}/v2/directions/driving-car`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ORS_API_KEY,
            },
            body: JSON.stringify({
                coordinates: coords,
                // Request encoded polyline (polyline5 is compatible with Google/OSRM format)
                format: 'json',
            }),
        });

        if (!res.ok) {
            // eslint-disable-next-line no-console
            console.warn('[DIRECTIONS] ORS route request failed:', res.status, res.statusText);
            return null;
        }

        const data = await res.json();

        // ORS returns geometry as encoded polyline in routes[0].geometry
        if (!data.routes?.[0]?.geometry) {
            // eslint-disable-next-line no-console
            console.warn('[DIRECTIONS] ORS route response missing geometry');
            return null;
        }

        return data.routes[0].geometry;
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[DIRECTIONS] Failed to fetch polyline from ORS:', err?.message || String(err));
        return null;
    }
}
