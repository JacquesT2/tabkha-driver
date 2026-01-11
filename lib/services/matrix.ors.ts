export type MatrixResult = {
    durationsSeconds: number[][];
    distancesMeters: number[][];
};

const ORS_API_KEY = process.env.ORS_API_KEY || '';
const ORS_BASE_URL = 'https://api.openrouteservice.org';

export async function buildMatrix(
    waypoints: Array<{ lat: number; lng: number }>,
    _departureTime: Date // ORS free tier doesn't use departure time
): Promise<MatrixResult> {
    if (waypoints.length === 0) {
        throw new Error('No waypoints provided');
    }

    if (!ORS_API_KEY) {
        throw new Error('ORS_API_KEY environment variable is required');
    }

    // ORS Matrix API v2: POST /v2/matrix/{profile}
    // Body: { locations: [[lng, lat], ...], metrics: ["duration", "distance"] }
    const locations = waypoints.map(w => [w.lng, w.lat]);

    const res = await fetch(`${ORS_BASE_URL}/v2/matrix/driving-car`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': ORS_API_KEY,
        },
        body: JSON.stringify({
            locations,
            metrics: ['duration', 'distance'],
            units: 'm', // meters for distance
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ORS matrix request failed: ${res.status} ${res.statusText} - ${text}`);
    }

    const data = await res.json();

    // ORS returns durations in seconds and distances in meters
    const durationsSeconds = (data.durations || []).map((row: number[]) => row || []);
    const distancesMeters = (data.distances || []).map((row: number[]) => row || []);

    if (durationsSeconds.length !== waypoints.length || distancesMeters.length !== waypoints.length) {
        throw new Error(`ORS returned matrix size mismatch. Expected ${waypoints.length}x${waypoints.length}`);
    }

    return { durationsSeconds, distancesMeters };
}
