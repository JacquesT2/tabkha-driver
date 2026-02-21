export type LatLng = {
    lat: number;
    lng: number;
};

export type Stop = {
    id: string;
    name: string;
    email?: string;
    address?: string;
    lat?: number;
    lng?: number;
    timeWindowStart: string;
    timeWindowEnd: string;
    serviceMinutes: number;
};

export type OptimizeRequest = {
    vehicleStartTimeIso: string;
    depot?: LatLng;
    stops: Stop[];
};

export type OptimizedStop = Stop & {
    etaIso: string;
    arrivalDelayMinutes: number;
    travelSecondsFromPrev?: number;
    waitSecondsBeforeWindow?: number;
    isDepotReturn?: boolean;
};

export type RouteSegment = {
    polyline: string;
    startStopIndex: number;
    endStopIndex: number;
};

export type OptimizeResponse = {
    orderedStops: OptimizedStop[];
    totalDistanceMeters: number;
    totalDurationSeconds: number;
    overviewPolyline: string;
    routeSegments?: RouteSegment[];
    driverStartTimeIso?: string;
    routes?: RouteResult[];
    geocodeWarnings?: Array<{ stopId: string; address: string; fallbackQuery: string }>;
};

export type RouteResult = {
    id: string;
    stops: OptimizedStop[];
    totalDurationSeconds: number;
    totalDistanceMeters: number;
    estimatedCost: number;
    averageCostPerDrop: number;
};

export type ErrorResponse = {
    code: 'INPUT_INVALID' | 'SERVICE_QUOTA' | 'SERVICE_DENIED' | 'NETWORK' | 'INTERNAL' | 'MONTHLY_CAP' | 'DUPLICATE_REQUEST' | 'NOT_FOUND' | 'RATE_LIMIT';
    message: string;
    details?: unknown;
};

export type MatrixResult = {
    durationsSeconds: number[][];
    distancesMeters: number[][];
};

export type ManualOrder = {
    id: string;
    customerName: string;
    address: string;
    deliveryWindow: string;
    status: string;
    deliveryDate: string;
};

export type ModifiedDrop = {
    id: string;
    order_id: string;
    original_delivery_date: string;
    new_delivery_date: string | null;
    new_delivery_window_start: string | null;
    new_delivery_window_end: string | null;
    status: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
};
