import { NextRequest, NextResponse } from 'next/server';
import type { OptimizeRequest, ErrorResponse } from '@/lib/types';
import { buildMatrix } from '@/lib/services/matrix.ors';
import { solveVRPTWTrafficAware } from '@/lib/optimizer/vrptw-traffic-aware';
import { computeEtas } from '@/lib/utils/eta';
import { getDirectionsPolyline, getSegmentPolylines } from '@/lib/services/directions.ors';
import { geocodeStopsIfNeeded } from '@/lib/services/geocode.nominatim';

export async function POST(request: NextRequest) {
    try {
        const body: OptimizeRequest = await request.json();

        if (!body || !Array.isArray(body.stops) || body.stops.length === 0) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid request body' } as ErrorResponse,
                { status: 400 }
            );
        }

        // Geocode any address-only stops
        const geocodeResult = await geocodeStopsIfNeeded(body.stops);

        // Filter out stops without coordinates
        const gcStops = geocodeResult.stops.filter(s => typeof s.lat === 'number' && typeof s.lng === 'number');
        const skippedStops = geocodeResult.stops.filter(s => typeof s.lat !== 'number' || typeof s.lng !== 'number');

        if (gcStops.length === 0) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'No valid stops after geocoding. All addresses failed to geocode.' } as ErrorResponse,
                { status: 400 }
            );
        }

        // Add warnings for skipped stops
        const allWarnings = [
            ...geocodeResult.warnings,
            ...skippedStops.map(s => ({
                stopId: s.id,
                address: s.address || 'No address',
                fallbackQuery: 'Geocoding failed - stop excluded from route'
            }))
        ];

        const first = gcStops[0];
        const depot = body.depot ?? { lat: first.lat!, lng: first.lng! };
        const waypoints = [depot, ...gcStops.map(s => ({ lat: s.lat!, lng: s.lng! }))];

        // Build matrix at an approximate departure time
        const earliestWindow = gcStops.reduce(
            (min, s) => Math.min(min, new Date(s.timeWindowStart).getTime()),
            Number.POSITIVE_INFINITY
        );
        const approxDeparture = new Date(Number.isFinite(earliestWindow) ? earliestWindow : Date.now());

        const matrix = await buildMatrix(waypoints, approxDeparture);

        const solveResult = solveVRPTWTrafficAware({
            matrixSeconds: matrix.durationsSeconds,
            serviceMinutes: body.stops.map(s => s.serviceMinutes),
            timeWindows: body.stops.map(s => ({ startIso: s.timeWindowStart, endIso: s.timeWindowEnd })),
            startTimeIso: body.vehicleStartTimeIso,
            avoidRushHour: true,
        });

        const orderedStops = solveResult.order.map((index: number) => gcStops[index]);

        // Compute driver start time
        let driverStartTimeIso: string | undefined;
        if (orderedStops.length > 0) {
            const firstIdx = solveResult.order[0] + 1;
            const travelToFirstSec = matrix.durationsSeconds[0][firstIdx];
            const firstWindowStart = new Date(orderedStops[0].timeWindowStart).getTime();
            const proposed = new Date(firstWindowStart - travelToFirstSec * 1000);
            const now = new Date();

            let allowPastDate = false;
            if (body.vehicleStartTimeIso) {
                const requestedDate = new Date(body.vehicleStartTimeIso);
                const requestedDay = new Date(requestedDate.getFullYear(), requestedDate.getMonth(), requestedDate.getDate());
                const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                allowPastDate = requestedDay.getTime() !== nowDay.getTime();
            }

            driverStartTimeIso = allowPastDate
                ? proposed.toISOString()
                : (proposed.getTime() < now.getTime() ? now : proposed).toISOString();
        }

        const etaResult = computeEtas({
            startTimeIso: driverStartTimeIso ?? new Date().toISOString(),
            depot,
            orderedStops,
            originalIndices: solveResult.order,
            durationsSeconds: matrix.durationsSeconds,
            distancesMeters: matrix.distancesMeters,
        });

        // Get polylines
        const routeSegments = await getSegmentPolylines({ depot, orderedStops: etaResult.orderedStops });
        const polyline = await getDirectionsPolyline({ depot, stops: orderedStops });

        const routes = splitRoutes(etaResult.orderedStops);

        return NextResponse.json({
            orderedStops: etaResult.orderedStops,
            totalDistanceMeters: etaResult.totalDistanceMeters,
            totalDurationSeconds: etaResult.totalDurationSeconds,
            overviewPolyline: polyline || '',
            routeSegments,
            driverStartTimeIso,
            geocodeWarnings: allWarnings,
            routes,
        });
    } catch (err: unknown) {
        console.error('[OPTIMIZE_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message } as ErrorResponse,
            { status: 500 }
        );
    }
}

function splitRoutes(stops: import('@/lib/types').OptimizedStop[]): import('@/lib/types').RouteResult[] {
    const routes: import('@/lib/types').RouteResult[] = [];
    let currentStops: import('@/lib/types').OptimizedStop[] = [];

    // Start with the first route
    let routeIndex = 1;

    for (const stop of stops) {
        currentStops.push(stop);

        // If this stop is a return to depot (but not just the very first start, though usually that's hidden)
        // logic: if isDepotReturn is true, it marks the END of a route leg.
        if (stop.isDepotReturn) {
            // finalize this route
            routes.push(createRouteResult(routeIndex++, currentStops));
            currentStops = [];
        }
    }

    // If there are remaining stops that didn't end with a depot return (shouldn't happen if logic is correct, but safe fallback)
    if (currentStops.length > 0) {
        routes.push(createRouteResult(routeIndex++, currentStops));
    }

    return routes;
}

function createRouteResult(index: number, stops: import('@/lib/types').OptimizedStop[]): import('@/lib/types').RouteResult {
    let totalDuration = 0;
    let totalDistance = 0;

    // Simple summation for this leg
    for (const s of stops) {
        totalDuration += (s.travelSecondsFromPrev || 0) + (s.waitSecondsBeforeWindow || 0) + (s.serviceMinutes * 60);
        // Note: Distance is not strictly tracked per stop in OptimizedStop unfortunately, 
        // but let's see if we can infer or if we need to change upstream.
        // Actually ComputeEtas just returns total. 
        // We'll approximate or need to update OptimizedStop to include distance from prev if we want accurate per-route distance.
        // For now, let's assume we can't easily get distance without schema change, 
        // BUT `computeEtas` returns totals. 
        // Let's modify OptimizedStop in types.ts? No, let's check eta.ts.
        // eta.ts has `travelMeters` but doesn't put it in OptimizedStop.
        // For now, let's leave distance as 0 or estimated, or we update eta.ts.
        // Let's stick to Duration for Cost.
    }

    // Cost: 30 EUR / hr
    // Duration in seconds / 3600 * 30
    const hours = totalDuration / 3600;
    const cost = Math.ceil(hours * 30 * 100) / 100; // Round to 2 decimals

    // Average cost per drop
    const dropCount = stops.filter(s => !s.isDepotReturn).length;
    let avgCost = 0;
    if (dropCount > 0) {
        avgCost = Math.ceil((cost / dropCount) * 100) / 100;
    }

    return {
        id: `route - ${index} `,
        stops,
        totalDurationSeconds: totalDuration,
        totalDistanceMeters: 0, // Placeholder as we miss per-stop distance in current type
        estimatedCost: cost,
        averageCostPerDrop: avgCost
    };
}
