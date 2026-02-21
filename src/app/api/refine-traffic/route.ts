import { NextRequest, NextResponse } from 'next/server';
import type { OptimizeRequest, OptimizeResponse, ErrorResponse, RouteResult } from '@/lib/types';
import { refineRouteWithTraffic } from '@/lib/services/refine-traffic.google';

export async function POST(request: NextRequest) {
    try {
        const body: OptimizeRequest & { routes?: RouteResult[] } = await request.json();

        if (!body) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid request body' } as ErrorResponse,
                { status: 400 }
            );
        }

        const depot = body.depot ?? { lat: body.stops?.[0]?.lat!, lng: body.stops?.[0]?.lng! };
        const driverStartTime = new Date(body.vehicleStartTimeIso);

        // Check if we have multiple routes to refine
        if (body.routes && body.routes.length > 0) {
            // Routes are driven by the SAME driver sequentially (they split at depot returns).
            // Each route starts when the previous route finishes.
            const refinedRoutes: RouteResult[] = [];
            let totalDuration = 0;
            let totalDistance = 0;
            let routeStartTime = new Date(driverStartTime); // starts at the same time for first route

            for (const route of body.routes) {
                const refined = await refineRouteWithTraffic(depot, route.stops as any, routeStartTime);

                const hours = refined.totalDurationSeconds / 3600;
                const cost = Math.ceil(hours * 30 * 100) / 100;

                refinedRoutes.push({
                    id: route.id,
                    stops: refined.orderedStops,
                    totalDurationSeconds: refined.totalDurationSeconds,
                    totalDistanceMeters: refined.totalDistanceMeters,
                    estimatedCost: cost,
                    averageCostPerDrop: refined.orderedStops.length > 0 ? Math.ceil((cost / refined.orderedStops.length) * 100) / 100 : 0,
                });

                totalDuration += refined.totalDurationSeconds;
                totalDistance += refined.totalDistanceMeters;

                // Next route starts after this one ends (sequential driver)
                routeStartTime = new Date(routeStartTime.getTime() + refined.totalDurationSeconds * 1000);
            }

            // Combine all stops for orderedStops
            const allStops = refinedRoutes.flatMap(r => r.stops);

            return NextResponse.json({
                orderedStops: allStops,
                totalDistanceMeters: totalDistance,
                totalDurationSeconds: totalDuration,
                overviewPolyline: '',
                driverStartTimeIso: driverStartTime.toISOString(),
                routes: refinedRoutes,
            } as OptimizeResponse);
        } else if (body.stops && body.stops.length > 0) {
            // Single route refinement (legacy support)
            const refined = await refineRouteWithTraffic(depot, body.stops as any, driverStartTime);

            const hours = refined.totalDurationSeconds / 3600;
            const cost = Math.ceil(hours * 30 * 100) / 100;

            return NextResponse.json({
                orderedStops: refined.orderedStops,
                totalDistanceMeters: refined.totalDistanceMeters,
                totalDurationSeconds: refined.totalDurationSeconds,
                overviewPolyline: '',
                driverStartTimeIso: driverStartTime.toISOString(),
                routes: [{
                    id: 'refined-route',
                    stops: refined.orderedStops,
                    totalDurationSeconds: refined.totalDurationSeconds,
                    totalDistanceMeters: refined.totalDistanceMeters,
                    estimatedCost: cost,
                    averageCostPerDrop: refined.orderedStops.length > 0 ? Math.ceil((cost / refined.orderedStops.length) * 100) / 100 : 0,
                }],
            } as OptimizeResponse);
        } else {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'No stops or routes provided' } as ErrorResponse,
                { status: 400 }
            );
        }
    } catch (err: unknown) {
        console.error('[REFINE_TRAFFIC_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message } as ErrorResponse,
            { status: 500 }
        );
    }
}
