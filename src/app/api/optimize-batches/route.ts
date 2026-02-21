import { NextRequest, NextResponse } from 'next/server';
import type { OptimizeRequest, OptimizeResponse, ErrorResponse, OptimizedStop } from '@/lib/types';
import { batchStopsByTimeSlot } from '@/lib/services/batch-timeslots';
import { solveVRPTW } from '@/lib/optimizer/vrptw';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

async function buildMatrixWithDirections(
    depot: { lat: number; lng: number },
    stops: Array<{ lat?: number; lng?: number }>,
    departureTime: Date
): Promise<{ durationsSeconds: number[][]; distancesMeters: number[][] }> {
    const locations = [depot, ...stops];
    const n = locations.length;
    const durationsSeconds: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    const distancesMeters: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

    // Build matrix by calling Directions API for each pair
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) continue;

            const origin = locations[i];
            const dest = locations[j];

            const urlParams = new URLSearchParams({
                origin: `${origin.lat},${origin.lng}`,
                destination: `${dest.lat},${dest.lng}`,
                mode: 'driving',
                key: GOOGLE_MAPS_API_KEY,
                departure_time: Math.floor(departureTime.getTime() / 1000).toString(),
                traffic_model: 'best_guess',
            });

            const url = `${GOOGLE_MAPS_BASE_URL}/directions/json?${urlParams.toString()}`;
            const res = await fetch(url);

            if (res.ok) {
                const data = await res.json();
                if (data.status === 'OK' && data.routes && data.routes.length > 0) {
                    const leg = data.routes[0].legs[0];
                    durationsSeconds[i][j] = leg.duration_in_traffic?.value || leg.duration.value;
                    distancesMeters[i][j] = leg.distance.value;
                }
            }
        }
    }

    return { durationsSeconds, distancesMeters };
}

export async function POST(request: NextRequest) {
    try {
        const body: OptimizeRequest = await request.json();

        if (!body || !Array.isArray(body.stops) || body.stops.length === 0) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid request body' } as ErrorResponse,
                { status: 400 }
            );
        }

        const depot = body.depot ?? { lat: body.stops[0].lat!, lng: body.stops[0].lng! };
        const driverStartTime = new Date(body.vehicleStartTimeIso);

        // Batch stops by time slots
        const batches = batchStopsByTimeSlot(body.stops);

        if (batches.length === 0) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'No stops within valid time slots (8-12, 12-16, 16-20)' } as ErrorResponse,
                { status: 400 }
            );
        }

        const routes: any[] = [];
        let totalDistance = 0;
        let totalDuration = 0;
        let allOrderedStops: OptimizedStop[] = [];

        // Optimize each batch separately
        for (const batch of batches) {
            // Build Google Maps distance matrix for this batch
            const matrix = await buildMatrixWithDirections(depot, batch.stops, driverStartTime);

            // Solve VRPTW for this batch
            const solution = solveVRPTW({
                matrixSeconds: matrix.durationsSeconds,
                serviceMinutes: batch.stops.map(() => 5), // 5 minutes service time per stop
                timeWindows: batch.stops.map(s => ({
                    startIso: s.timeWindowStart,
                    endIso: s.timeWindowEnd
                })),
                startTimeIso: driverStartTime.toISOString()
            });

            // Reorder stops based on solution
            const orderedStops: OptimizedStop[] = solution.order.map((idx, position) => {
                const stop = batch.stops[idx];
                return {
                    ...stop,
                    sequenceNumber: position + 1,
                    travelSecondsFromPrev: 0, // Will be filled below
                    waitSecondsBeforeWindow: 0,
                    etaIso: driverStartTime.toISOString(),
                    arrivalDelayMinutes: 0,
                } as OptimizedStop;
            });

            // Calculate travel times and ETAs
            let currentTime = new Date(driverStartTime);
            let batchDistance = 0;
            let batchDuration = 0;
            const serviceTime = 300; // 5 minutes in seconds

            for (let i = 0; i < orderedStops.length; i++) {
                const prevIdx = i === 0 ? 0 : solution.order[i - 1] + 1; // +1 because depot is index 0
                const currIdx = solution.order[i] + 1;

                const travelTime = matrix.durationsSeconds[prevIdx][currIdx];
                const distance = matrix.distancesMeters[prevIdx][currIdx];

                currentTime = new Date(currentTime.getTime() + travelTime * 1000);
                orderedStops[i].travelSecondsFromPrev = travelTime;
                orderedStops[i].etaIso = currentTime.toISOString();

                // Check if we need to wait for time window
                const windowStart = new Date(orderedStops[i].timeWindowStart);
                if (currentTime < windowStart) {
                    const waitTime = (windowStart.getTime() - currentTime.getTime()) / 1000;
                    orderedStops[i].waitSecondsBeforeWindow = waitTime;
                    currentTime = windowStart;
                }

                // Add service time
                currentTime = new Date(currentTime.getTime() + serviceTime * 1000);

                // Calculate delay
                const windowEnd = new Date(orderedStops[i].timeWindowEnd);
                const arrivalTime = new Date(orderedStops[i].etaIso);
                orderedStops[i].arrivalDelayMinutes = Math.max(0, Math.round((arrivalTime.getTime() - windowEnd.getTime()) / 60000));

                batchDistance += distance;
                batchDuration += travelTime + (orderedStops[i].waitSecondsBeforeWindow || 0) + serviceTime;
            }

            // Calculate cost for this route
            const hours = batchDuration / 3600;
            const cost = Math.ceil(hours * 30 * 100) / 100;

            routes.push({
                id: `batch-${batch.slotName.toLowerCase()}`,
                stops: orderedStops,
                totalDurationSeconds: batchDuration,
                totalDistanceMeters: batchDistance,
                estimatedCost: cost,
                averageCostPerDrop: orderedStops.length > 0
                    ? Math.ceil((cost / orderedStops.length) * 100) / 100
                    : 0,
            });

            totalDistance += batchDuration;
            totalDuration += batchDuration;
            allOrderedStops.push(...orderedStops);
        }

        return NextResponse.json({
            orderedStops: allOrderedStops,
            totalDistanceMeters: totalDistance,
            totalDurationSeconds: totalDuration,
            overviewPolyline: '',
            driverStartTimeIso: driverStartTime.toISOString(),
            routes,
        } as OptimizeResponse);

    } catch (err: unknown) {
        console.error('[OPTIMIZE_BATCHES_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message } as ErrorResponse,
            { status: 500 }
        );
    }
}
