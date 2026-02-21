// Traffic-aware VRPTW solver that prefers later delivery times to avoid rush hour
// For 8-12 window: prefer deliveries closer to 12:00
// For 12-16 window: prefer deliveries closer to 16:00  
// For 16-20 window: prefer deliveries closer to 16:00 (avoid evening rush)

type SolveInput = {
    matrixSeconds: number[][]; // includes depot at index 0; stops are 1..n
    serviceMinutes: number[];  // length n (for stops only)
    timeWindows: Array<{ startIso: string; endIso: string }>; // length n
    startTimeIso?: string; // route start time
    avoidRushHour?: boolean; // NEW: enable traffic-aware scheduling
};

export function solveVRPTWTrafficAware(input: SolveInput): { order: number[] } {
    const n = input.serviceMinutes.length;
    const visited = new Array<boolean>(n).fill(false);
    const serviceSec = input.serviceMinutes.map(m => Math.max(0, Math.round(m * 60)));
    const winStart = input.timeWindows.map(t => Math.floor(new Date(t.startIso).getTime() / 1000));
    const winEnd = input.timeWindows.map(t => Math.floor(new Date(t.endIso).getTime() / 1000));

    let currentNode = -1; // depot (matrix index 0, stops are 1..n)

    // If no start time provided, use the earliest time window start
    let currentTime: number;
    if (input.startTimeIso) {
        currentTime = Math.floor(new Date(input.startTimeIso).getTime() / 1000);
        console.log(`[VRPTW] Using provided start time: ${new Date(currentTime * 1000).toISOString()}`);
    } else {
        // Start early enough to reach the earliest window
        const earliestWindow = Math.min(...winStart);
        currentTime = earliestWindow - 3600; // Start 1 hour before earliest window
        console.log(`[VRPTW] No start time provided. Earliest window: ${new Date(earliestWindow * 1000).toISOString()}, using start time: ${new Date(currentTime * 1000).toISOString()}`);
    }

    console.log(`[VRPTW] Starting optimization with ${n} stops. Traffic-aware: ${input.avoidRushHour}`);

    const order: number[] = [];

    while (order.length < n) {
        let bestIdx = -1;
        let bestScore = Infinity;

        for (let i = 0; i < n; i++) {
            if (visited[i]) continue;

            const travelTime = input.matrixSeconds[currentNode + 1]?.[i + 1] ?? 0;
            const arrivalTime = currentTime + travelTime;
            const serviceStart = Math.max(arrivalTime, winStart[i]);
            const serviceEnd = serviceStart + serviceSec[i];

            // Check if feasible (can complete service before window closes)
            if (serviceEnd > winEnd[i]) {
                // eslint-disable-next-line no-console
                console.log(`[VRPTW] Stop ${i} infeasible:`);
                console.log(`  Current time: ${new Date(currentTime * 1000).toISOString()}`);
                console.log(`  Travel time: ${Math.round(travelTime / 60)} minutes`);
                console.log(`  Arrival time: ${new Date(arrivalTime * 1000).toISOString()}`);
                console.log(`  Window: ${new Date(winStart[i] * 1000).toISOString()} - ${new Date(winEnd[i] * 1000).toISOString()}`);
                console.log(`  Service start: ${new Date(serviceStart * 1000).toISOString()}`);
                console.log(`  Service end: ${new Date(serviceEnd * 1000).toISOString()} (TOO LATE)`);
                continue;
            }

            // Calculate score based on traffic-aware preferences
            let score: number;

            // Standard VRP scoring: Minimize Wait + Travel
            // We want to minimize total time consumed (travel + waiting)
            const wait = Math.max(0, winStart[i] - arrivalTime);

            // Base score: Travel time + Waiting time
            // This naturally prioritizes:
            // 1. Feasible stops (wait is small) vs Infeasible (wait is huge if window starts later)
            // 2. Nearest neighbors (travel is small)
            score = travelTime + wait;

            // Traffic-aware penalty
            if (input.avoidRushHour) {
                const arrivalHour = new Date(arrivalTime * 1000).getHours();
                const isRushHour = (arrivalHour >= 8 && arrivalHour < 10) || (arrivalHour >= 16 && arrivalHour < 19);
                if (isRushHour) {
                    // Add penalty for driving/arriving during rush hour
                    // This encourages scheduling stops outside of rush hour if possible
                    score += travelTime * 0.5;
                }
            }

            if (score < bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }

        if (bestIdx === -1) {
            // eslint-disable-next-line no-console
            console.log(`[VRPTW] No more feasible stops. Completed ${order.length}/${n} stops`);
            break; // No more feasible stops
        }

        visited[bestIdx] = true;
        order.push(bestIdx);

        const travelTime = input.matrixSeconds[currentNode + 1]?.[bestIdx + 1] ?? 0;
        const arrivalTime = currentTime + travelTime;
        const serviceStart = Math.max(arrivalTime, winStart[bestIdx]);

        currentTime = serviceStart + serviceSec[bestIdx];
        currentNode = bestIdx;
    }

    return { order };
}
