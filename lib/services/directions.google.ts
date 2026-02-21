const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

export async function getDirectionsPolyline(params: {
    depot: { lat: number; lng: number };
    stops: Array<{ lat?: number; lng?: number }>;
    departureTime?: Date;
}): Promise<string | null> {
    if (!GOOGLE_MAPS_API_KEY) {
        throw new Error('GOOGLE_MAPS_API_KEY environment variable is required');
    }

    const validStops = params.stops.filter(s => s.lat != null && s.lng != null);
    if (validStops.length === 0) return null;

    // Google Directions API supports up to 25 waypoints (excluding origin and destination)
    // For routes with more stops, we'd need to batch or use a different approach
    if (validStops.length > 23) {
        console.warn('Route has more than 23 stops, Google Maps may not return full polyline');
    }

    // Build waypoints (all stops except the last one, which becomes destination)
    const waypoints = validStops.slice(0, -1).map(s => `${s.lat},${s.lng}`);
    const lastStop = validStops[validStops.length - 1];

    const urlParams = new URLSearchParams({
        origin: `${params.depot.lat},${params.depot.lng}`,
        destination: `${lastStop.lat},${lastStop.lng}`,
        mode: 'driving',
        key: GOOGLE_MAPS_API_KEY,
    });

    if (waypoints.length > 0) {
        urlParams.set('waypoints', waypoints.join('|'));
    }

    // Add departure time if provided for traffic-aware routing
    if (params.departureTime) {
        const timestamp = Math.floor(params.departureTime.getTime() / 1000);
        urlParams.set('departure_time', timestamp.toString());
        urlParams.set('traffic_model', 'best_guess');
    }

    const url = `${GOOGLE_MAPS_BASE_URL}/directions/json?${urlParams.toString()}`;

    const res = await fetch(url);

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google Maps Directions request failed: ${res.status} ${res.statusText} - ${text}`);
    }

    const data = await res.json();

    if (data.status !== 'OK') {
        throw new Error(`Google Maps Directions API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
    }

    // Extract the overview polyline
    if (data.routes && data.routes.length > 0 && data.routes[0].overview_polyline) {
        return data.routes[0].overview_polyline.points;
    }

    return null;
}

export async function getSegmentPolylines(params: {
    depot: { lat: number; lng: number };
    orderedStops: Array<{ lat?: number; lng?: number; etaIso?: string }>;
}): Promise<Array<{ fromIndex: number; toIndex: number; polyline: string }>> {
    if (!GOOGLE_MAPS_API_KEY) {
        throw new Error('GOOGLE_MAPS_API_KEY environment variable is required');
    }

    const segments: Array<{ fromIndex: number; toIndex: number; polyline: string }> = [];
    const validStops = params.orderedStops.filter(s => s.lat != null && s.lng != null);

    if (validStops.length === 0) return segments;

    // Get segment from depot to first stop
    const firstStop = validStops[0];
    const firstDepartureTime = firstStop.etaIso ? new Date(firstStop.etaIso) : undefined;

    const firstSegmentPolyline = await getSegmentPolyline(
        params.depot,
        { lat: firstStop.lat!, lng: firstStop.lng! },
        firstDepartureTime
    );

    if (firstSegmentPolyline) {
        segments.push({ fromIndex: -1, toIndex: 0, polyline: firstSegmentPolyline });
    }

    // Get segments between consecutive stops
    for (let i = 0; i < validStops.length - 1; i++) {
        const from = validStops[i];
        const to = validStops[i + 1];

        // Use the ETA of the destination stop as departure time for traffic estimation
        const departureTime = to.etaIso ? new Date(to.etaIso) : undefined;

        const polyline = await getSegmentPolyline(
            { lat: from.lat!, lng: from.lng! },
            { lat: to.lat!, lng: to.lng! },
            departureTime
        );

        if (polyline) {
            segments.push({ fromIndex: i, toIndex: i + 1, polyline });
        }
    }

    return segments;
}

async function getSegmentPolyline(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    departureTime?: Date
): Promise<string | null> {
    const urlParams = new URLSearchParams({
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        mode: 'driving',
        key: GOOGLE_MAPS_API_KEY,
    });

    if (departureTime) {
        const timestamp = Math.floor(departureTime.getTime() / 1000);
        urlParams.set('departure_time', timestamp.toString());
        urlParams.set('traffic_model', 'best_guess');
    }

    const url = `${GOOGLE_MAPS_BASE_URL}/directions/json?${urlParams.toString()}`;

    try {
        const res = await fetch(url);
        if (!res.ok) return null;

        const data = await res.json();
        if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
            return null;
        }

        return data.routes[0].overview_polyline?.points || null;
    } catch (err) {
        console.error('Failed to fetch segment polyline:', err);
        return null;
    }
}
