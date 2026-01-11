import { NextRequest, NextResponse } from 'next/server';
import type { OptimizeRequest, ErrorResponse } from '@/lib/types';
import { buildMatrix } from '@/lib/services/matrix.ors';
import { solveVRPTW } from '@/lib/optimizer/vrptw';
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
        const gcStops = geocodeResult.stops;

        if (gcStops.length === 0) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'No valid stops after geocoding' } as ErrorResponse,
                { status: 400 }
            );
        }

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

        const solveResult = solveVRPTW({
            matrixSeconds: matrix.durationsSeconds,
            serviceMinutes: body.stops.map(s => s.serviceMinutes),
            timeWindows: body.stops.map(s => ({ startIso: s.timeWindowStart, endIso: s.timeWindowEnd })),
        });

        const orderedStops = solveResult.order.map(index => gcStops[index]);

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

        return NextResponse.json({
            orderedStops: etaResult.orderedStops,
            totalDistanceMeters: etaResult.totalDistanceMeters,
            totalDurationSeconds: etaResult.totalDurationSeconds,
            overviewPolyline: polyline || '',
            routeSegments,
            driverStartTimeIso,
            geocodeWarnings: geocodeResult.warnings,
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
