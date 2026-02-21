/**
 * Google Maps Traffic Refinement Service
 * 
 * Refines time estimates for an already-optimized route using Google Maps traffic data.
 * This is much more cost-effective than full route optimization:
 * - Only calls Directions API for actual route segments (N calls for N stops)
 * - Doesn't need Distance Matrix API (no N×N matrix)
 * - Provides traffic-aware duration estimates for the specific delivery date/time
 */

import type { OptimizedStop } from '@/lib/types';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

export interface RefinedRoute {
    orderedStops: OptimizedStop[];
    totalDurationSeconds: number;
    totalDistanceMeters: number;
    trafficDelaySeconds: number; // Additional time due to traffic
}

/**
 * Refines an already-optimized route with Google Maps traffic data
 * 
 * @param depot - Starting/ending depot location
 * @param orderedStops - Route already optimized by ORS
 * @param driverStartTime - When the driver starts the route
 * @returns Route with traffic-aware time estimates
 */
export async function refineRouteWithTraffic(
    depot: { lat: number; lng: number },
    orderedStops: OptimizedStop[],
    driverStartTime: Date
): Promise<RefinedRoute> {
    if (!GOOGLE_MAPS_API_KEY) {
        throw new Error('GOOGLE_MAPS_API_KEY environment variable is required');
    }

    if (orderedStops.length === 0) {
        return {
            orderedStops: [],
            totalDurationSeconds: 0,
            totalDistanceMeters: 0,
            trafficDelaySeconds: 0,
        };
    }

    const refinedStops: OptimizedStop[] = [];
    let currentTime = new Date(driverStartTime);
    let totalDuration = 0;
    let totalDistance = 0;
    let totalTrafficDelay = 0;

    // Process each segment
    for (let i = 0; i < orderedStops.length; i++) {
        const stop = orderedStops[i];

        const prevLocation = i === 0 ? depot : { lat: orderedStops[i - 1].lat!, lng: orderedStops[i - 1].lng! };
        const currentLocation = { lat: stop.lat!, lng: stop.lng! };

        // Get traffic-aware duration for this segment
        const segmentData = await getSegmentDuration(
            prevLocation,
            currentLocation,
            currentTime
        );

        const trafficDelay = Math.max(0, segmentData.durationInTraffic - segmentData.duration);
        totalTrafficDelay += trafficDelay;
        totalDistance += segmentData.distance;

        const travelSeconds = segmentData.durationInTraffic;
        const arrivalTime = new Date(currentTime.getTime() + travelSeconds * 1000);

        if (stop.isDepotReturn) {
            // Depot-return stop: just transit time, no service time.
            // The driver arrives at depot and departs again for the next stop.
            refinedStops.push({
                ...stop,
                travelSecondsFromPrev: travelSeconds,
                waitSecondsBeforeWindow: 0,
                etaIso: arrivalTime.toISOString(),
                arrivalDelayMinutes: 0,
            });
            totalDuration += travelSeconds;
            currentTime = arrivalTime; // next segment departs from depot
            continue;
        }

        // Regular delivery stop
        const windowStart = new Date(stop.timeWindowStart);
        const windowEnd = new Date(stop.timeWindowEnd);
        let waitSeconds = 0;

        if (arrivalTime < windowStart) {
            waitSeconds = Math.floor((windowStart.getTime() - arrivalTime.getTime()) / 1000);
        }

        const serviceStart = waitSeconds > 0 ? windowStart : arrivalTime;
        const serviceTimeSeconds = (stop.serviceMinutes || 0) * 60;
        const serviceEnd = new Date(serviceStart.getTime() + serviceTimeSeconds * 1000);

        refinedStops.push({
            ...stop,
            travelSecondsFromPrev: travelSeconds,
            waitSecondsBeforeWindow: waitSeconds,
            etaIso: arrivalTime.toISOString(),
            arrivalDelayMinutes: waitSeconds > 0 ? 0 : Math.max(0, Math.floor((arrivalTime.getTime() - windowEnd.getTime()) / 60000)),
        });

        totalDuration += travelSeconds + waitSeconds + serviceTimeSeconds;

        // Move to next segment's departure time (after service completes)
        currentTime = serviceEnd;
    }

    // Add final return to depot ONLY if the last stop was NOT already a depot-return
    // (avoids double-counting the return trip that was already processed in the loop above)
    const lastStop = orderedStops[orderedStops.length - 1];
    if (lastStop && !lastStop.isDepotReturn) {
        const returnSegment = await getSegmentDuration(
            { lat: lastStop.lat!, lng: lastStop.lng! },
            depot,
            currentTime
        );

        const returnTrafficDelay = Math.max(0, returnSegment.durationInTraffic - returnSegment.duration);
        totalTrafficDelay += returnTrafficDelay;
        totalDuration += returnSegment.durationInTraffic;
        totalDistance += returnSegment.distance;
    }

    return {
        orderedStops: refinedStops,
        totalDurationSeconds: totalDuration,
        totalDistanceMeters: totalDistance,
        trafficDelaySeconds: totalTrafficDelay,
    };
}

interface SegmentData {
    duration: number; // Base duration without traffic (seconds)
    durationInTraffic: number; // Duration with traffic (seconds)
    distance: number; // Distance in meters
}

/**
 * Gets duration and distance for a single route segment using Google Directions API
 */
async function getSegmentDuration(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    departureTime: Date
): Promise<SegmentData> {
    const departureTimestamp = Math.floor(departureTime.getTime() / 1000);

    const params = new URLSearchParams({
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        mode: 'driving',
        departure_time: departureTimestamp.toString(),
        traffic_model: 'best_guess',
        key: GOOGLE_MAPS_API_KEY,
    });

    const url = `${GOOGLE_MAPS_BASE_URL}/directions/json?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google Directions API request failed: ${res.status} ${res.statusText} - ${text}`);
    }

    const data = await res.json();

    if (data.status !== 'OK') {
        throw new Error(`Google Directions API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
    }

    if (!data.routes || data.routes.length === 0) {
        throw new Error('No routes found');
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    return {
        duration: leg.duration.value, // Base duration
        durationInTraffic: leg.duration_in_traffic?.value || leg.duration.value, // Traffic-aware duration
        distance: leg.distance.value,
    };
}
