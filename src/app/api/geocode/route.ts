import { NextRequest, NextResponse } from 'next/server';
import { tryGeocodeWithFallback } from '@/lib/services/geocode.nominatim';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const address = searchParams.get('address');

        if (!address) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Missing address parameter' },
                { status: 400 }
            );
        }

        const result = await tryGeocodeWithFallback(address);

        if (!result) {
            return NextResponse.json(
                { code: 'NOT_FOUND', message: 'Address could not be geocoded' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            lat: result.lat,
            lng: result.lng,
            usedFallback: result.usedFallback,
            fallbackQuery: result.fallbackQuery,
        });
    } catch (err: unknown) {
        console.error('[GEOCODE_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
