import { NextRequest, NextResponse } from 'next/server';
import { saveGeocodingForStops } from '@/lib/services/persistence.supabase';
import type { Stop } from '@/lib/types';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        if (!body || !Array.isArray(body.stops)) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid request body' },
                { status: 400 }
            );
        }

        const stops: Stop[] = body.stops;
        const warnings = body.warnings || [];

        // Create a set of stop IDs that used fallbacks (should not be persisted)
        const excludeStopIds = new Set<string>(
            warnings.map((w: any) => w.stopId)
        );

        await saveGeocodingForStops(stops, excludeStopIds);

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        console.error('[GEOCODING_SAVE_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
