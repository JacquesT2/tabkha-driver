import { NextRequest, NextResponse } from 'next/server';
import type { Stop } from '@/lib/types';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

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

        if (!GOOGLE_MAPS_API_KEY) {
            return NextResponse.json(
                { code: 'CONFIG_ERROR', message: 'Google Maps API key not configured' },
                { status: 500 }
            );
        }

        const url = `${GOOGLE_MAPS_BASE_URL}/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
            return NextResponse.json(
                { code: 'EXTERNAL_ERROR', message: 'Google Maps API request failed' },
                { status: 502 }
            );
        }

        const data = await res.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            return NextResponse.json({
                lat: location.lat,
                lng: location.lng,
                usedFallback: false,
            });
        }

        return NextResponse.json(
            { code: 'NOT_FOUND', message: 'Address could not be geocoded' },
            { status: 404 }
        );
    } catch (err: unknown) {
        console.error('[GEOCODE_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
