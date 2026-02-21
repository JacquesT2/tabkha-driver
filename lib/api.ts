import type { OptimizeRequest, OptimizeResponse, ErrorResponse, Stop } from '@/lib/types';
import type { CustomRouteSummary } from '@/lib/services/persistence.supabase';

export async function optimize(req: OptimizeRequest): Promise<OptimizeResponse> {
    const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
    });
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    return res.json();
}

export async function refineWithTraffic(req: OptimizeRequest): Promise<OptimizeResponse> {
    const res = await fetch('/api/refine-traffic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
    });
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    return res.json();
}

export async function optimizeByTimeSlots(req: OptimizeRequest): Promise<OptimizeResponse> {
    const res = await fetch('/api/optimize-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
    });
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    return res.json();
}

export async function fetchDeliveries(date: string): Promise<Stop[]> {
    const res = await fetch(`/api/deliveries?date=${date}`);
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    const data = await res.json();
    return data.stops;
}

export async function fetchAllDeliveryDates(): Promise<string[]> {
    const res = await fetch('/api/deliveries?list=true');
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    const data = await res.json();
    return data.dates;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
    if (!res.ok) {
        if (res.status === 404) return null;
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    return res.json();
}

export async function fetchClients(): Promise<any[]> {
    const res = await fetch('/api/clients');
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    const data = await res.json();
    return data.clients;
}

// Stub functions for features that need backend API routes
// These will need proper backend routes to be fully functional

export async function geocodeStops(stops: Stop[]): Promise<{ stops: Stop[]; warnings?: Array<{ stopId: string; address: string; fallbackQuery: string }> }> {
    const res = await fetch('/api/geocode-stops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops }),
    });
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    return res.json();
}

export async function saveGeocoding(
    stops: Stop[],
    warnings: Array<{ stopId: string; address: string; fallbackQuery: string }> = []
): Promise<void> {
    const res = await fetch('/api/deliveries/geocoding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops, warnings }),
    });

    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        console.warn(`Failed to save geocoding: ${err.message}`);
        // Don't throw, just warn, as this is a background operation
    }
}

export async function saveRoute(date: string, route: OptimizeResponse, depot: { lat: number; lng: number }): Promise<void> {
    const res = await fetch(`/api/deliveries/route/${date}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route, depot }),
    });

    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
}

export async function loadRoute(date: string): Promise<{ route: OptimizeResponse; depot: { lat: number; lng: number } } | null> {
    const res = await fetch(`/api/deliveries/route/${date}`);

    if (res.status === 404) return null;

    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }

    return res.json();
}

export async function listCustomRoutes(date: string): Promise<CustomRouteSummary[]> {
    const res = await fetch(`/api/deliveries/custom-routes/${date}`);
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    const data = await res.json();
    return data.routes;
}

export async function saveCustomRouteApi(
    date: string,
    name: string,
    description: string | undefined,
    route: OptimizeResponse,
    depot: { lat: number; lng: number }
): Promise<string> {
    const res = await fetch(`/api/deliveries/custom-routes/${date}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, route, depot }),
    });
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    const data = await res.json();
    return data.id;
}

export async function loadCustomRouteApi(
    date: string,
    id: string
): Promise<{ route: OptimizeResponse; depot: { lat: number; lng: number }; name: string } | null> {
    const res = await fetch(`/api/deliveries/custom-routes/${date}/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) {
        const err: ErrorResponse = await res.json().catch(() => ({ code: 'INTERNAL', message: 'Unknown error' }));
        throw new Error(`${err.code}: ${err.message}`);
    }
    return res.json();
}
