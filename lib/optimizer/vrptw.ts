// Greedy VRPTW heuristic (single vehicle) as a fallback when OR-Tools is unavailable.
// Chooses the next feasible stop with the earliest time window start reachable, breaking ties by travel time.
type SolveInput = {
  matrixSeconds: number[][]; // includes depot at index 0; stops are 1..n
  serviceMinutes: number[];  // length n (for stops only)
  timeWindows: Array<{ startIso: string; endIso: string }>; // length n
  startTimeIso?: string; // route start time
};

export function solveVRPTW(input: SolveInput): { order: number[] } {
  const n = input.serviceMinutes.length;
  const visited = new Array<boolean>(n).fill(false);
  const serviceSec = input.serviceMinutes.map(m => Math.max(0, Math.round(m * 60)));
  const winStart = input.timeWindows.map(t => Math.floor(new Date(t.startIso).getTime() / 1000));
  const winEnd = input.timeWindows.map(t => Math.floor(new Date(t.endIso).getTime() / 1000));

  let currentNode = 0; // depot
  let currentTime = input.startTimeIso ? Math.floor(new Date(input.startTimeIso).getTime() / 1000) : 0;

  const order: number[] = [];
  for (let k = 0; k < n; k++) {
    let bestIdx = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const node = i + 1;
      const travel = input.matrixSeconds[currentNode][node];
      const arrival = currentTime + travel;
      const wait = Math.max(0, winStart[i] - arrival);
      const lateness = Math.max(0, arrival - winEnd[i]);
      // Feasibility: allow late arrivals (penalize heavily) to avoid dead-ends
      const score = (lateness > 0 ? 1e9 + lateness : 0) + wait + travel;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    // move
    const node = bestIdx + 1;
    const travel = input.matrixSeconds[currentNode][node];
    currentTime = currentTime + travel;
    if (currentTime < winStart[bestIdx]) currentTime = winStart[bestIdx];
    currentTime += serviceSec[bestIdx];
    visited[bestIdx] = true;
    order.push(bestIdx);
    currentNode = node;
  }
  if (order.length !== n) {
    // Not all visited; remaining appended arbitrarily by nearest travel time
    for (let i = 0; i < n; i++) if (!visited[i]) order.push(i);
  }
  return { order };
}


