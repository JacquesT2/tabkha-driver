import { NextRequest, NextResponse } from 'next/server';
import type { Stop } from '@/lib/types';
import { geocodeStopsIfNeeded } from '@/lib/services/geocode.google';

export async function POST(request: NextRequest) {
    try {
        const body: { stops: Stop[] } = await request.json();

        if (!body || !Array.isArray(body.stops)) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid request body' },
                { status: 400 }
            );
        }

        const result = await geocodeStopsIfNeeded(body.stops);

        return NextResponse.json(result);
    } catch (err: unknown) {
        console.error('[GEOCODE_STOPS_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
