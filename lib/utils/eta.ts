import type { Stop, OptimizedStop } from '@/lib/types';

/**
 * Determines if two time windows are in different time periods
 * Periods: Morning (7-12), Afternoon (12-16), Evening (16-20)
 */
function isDifferentTimePeriod(timeWindow1: string, timeWindow2: string): boolean {
  const getTimePeriod = (isoString: string): number => {
    const hour = new Date(isoString).getHours();
    if (hour >= 7 && hour < 12) return 1; // Morning
    if (hour >= 12 && hour < 16) return 2; // Afternoon
    if (hour >= 16 && hour < 20) return 3; // Evening
    return 0; // Other
  };

  return getTimePeriod(timeWindow1) !== getTimePeriod(timeWindow2);
}

export function computeEtas(params: {
  startTimeIso: string;
  depot: { lat: number; lng: number };
  orderedStops: Stop[];
  originalIndices: number[]; // Maps orderedStops position to original stop index (for matrix lookup)
  durationsSeconds: number[][]; // square matrix incl. depot first
  distancesMeters: number[][];  // square matrix incl. depot first
}): { orderedStops: OptimizedStop[]; totalDistanceMeters: number; totalDurationSeconds: number } {
  const WAIT_THRESHOLD_SECONDS = 25 * 60; // 25 minutes
  const startTime = new Date(params.startTimeIso);
  let currentTime = new Date(startTime);
  let prevMatrixNode = 0; // depot index in matrix
  let totalDistance = 0;
  let totalDuration = 0;

  const result: OptimizedStop[] = [];
  params.orderedStops.forEach((stop, idx) => {
    // Use original index to look up in matrix (matrix nodes are: depot=0, stops=1..n in original order)
    const originalStopIndex = params.originalIndices[idx];
    const matrixNodeIndex = originalStopIndex + 1;
    const travelSec = params.durationsSeconds[prevMatrixNode][matrixNodeIndex];
    const travelMeters = params.distancesMeters[prevMatrixNode][matrixNodeIndex];
    totalDistance += travelMeters;
    totalDuration += travelSec;
    const arrivalAtStop = new Date(currentTime.getTime() + travelSec * 1000);

    const windowStart = new Date(stop.timeWindowStart);
    const windowEnd = new Date(stop.timeWindowEnd);
    let waitSeconds = 0;
    if (arrivalAtStop < windowStart) {
      waitSeconds = Math.floor((windowStart.getTime() - arrivalAtStop.getTime()) / 1000);
    }

    // Determine if we should return to depot:
    // 1. If wait time exceeds threshold (25 minutes)
    // 2. If this stop is in a different time period than the previous stop
    const shouldReturnToDepot = waitSeconds > WAIT_THRESHOLD_SECONDS ||
      (idx > 0 && isDifferentTimePeriod(params.orderedStops[idx - 1].timeWindowStart, stop.timeWindowStart));

    if (shouldReturnToDepot) {
      // Go back to depot
      const returnToDepotSec = params.durationsSeconds[matrixNodeIndex][0];
      const returnToDepotMeters = params.distancesMeters[matrixNodeIndex][0];
      totalDistance += returnToDepotMeters;
      totalDuration += returnToDepotSec;
      const arrivalAtDepot = new Date(arrivalAtStop.getTime() + returnToDepotSec * 1000);

      // Add depot return marker
      result.push({
        id: `depot-return-${idx}`,
        name: 'Return to Depot',
        lat: params.depot.lat,
        lng: params.depot.lng,
        timeWindowStart: arrivalAtDepot.toISOString(),
        timeWindowEnd: arrivalAtDepot.toISOString(),
        serviceMinutes: 0,
        etaIso: arrivalAtDepot.toISOString(),
        arrivalDelayMinutes: 0,
        travelSecondsFromPrev: returnToDepotSec,
        waitSecondsBeforeWindow: 0,
        isDepotReturn: true,
      });

      // From depot, time departure to arrive at stop when window opens
      const travelFromDepotSec = params.durationsSeconds[0][matrixNodeIndex];
      const travelFromDepotMeters = params.distancesMeters[0][matrixNodeIndex];
      totalDistance += travelFromDepotMeters;
      totalDuration += travelFromDepotSec;
      const departureFromDepot = new Date(windowStart.getTime() - travelFromDepotSec * 1000);
      const actualArrival = new Date(windowStart);
      currentTime = new Date(actualArrival.getTime() + stop.serviceMinutes * 60000);
      prevMatrixNode = matrixNodeIndex;

      result.push({
        ...stop,
        etaIso: actualArrival.toISOString(),
        arrivalDelayMinutes: 0,
        travelSecondsFromPrev: travelFromDepotSec,
        waitSecondsBeforeWindow: 0,
      });
    } else {
      // Normal flow: proceed directly to stop
      let arrival = new Date(arrivalAtStop);
      if (arrival < windowStart) {
        totalDuration += waitSeconds;
        arrival = new Date(windowStart);
      }
      const delayMin = Math.max(0, Math.ceil((arrival.getTime() - windowEnd.getTime()) / 60000));
      const serviceMs = stop.serviceMinutes * 60000;
      currentTime = new Date(arrival.getTime() + serviceMs);

      result.push({
        ...stop,
        etaIso: arrival.toISOString(),
        arrivalDelayMinutes: delayMin,
        travelSecondsFromPrev: travelSec,
        waitSecondsBeforeWindow: waitSeconds,
      });
      prevMatrixNode = matrixNodeIndex;
    }
  });

  // Add final return to depot after all stops
  if (params.orderedStops.length > 0 && prevMatrixNode > 0) {
    // prevMatrixNode tracks the last visited stop's matrix node index
    const returnToDepotSec = params.durationsSeconds[prevMatrixNode][0];
    const returnToDepotMeters = params.distancesMeters[prevMatrixNode][0];
    totalDistance += returnToDepotMeters;
    totalDuration += returnToDepotSec;
    const arrivalAtDepot = new Date(currentTime.getTime() + returnToDepotSec * 1000);

    // Add final depot return marker
    result.push({
      id: 'depot-return-final',
      name: 'Return to Depot',
      lat: params.depot.lat,
      lng: params.depot.lng,
      timeWindowStart: arrivalAtDepot.toISOString(),
      timeWindowEnd: arrivalAtDepot.toISOString(),
      serviceMinutes: 0,
      etaIso: arrivalAtDepot.toISOString(),
      arrivalDelayMinutes: 0,
      travelSecondsFromPrev: returnToDepotSec,
      waitSecondsBeforeWindow: 0,
      isDepotReturn: true,
    });
  }

  return {
    orderedStops: result,
    totalDistanceMeters: totalDistance,
    totalDurationSeconds: totalDuration,
  };
}


