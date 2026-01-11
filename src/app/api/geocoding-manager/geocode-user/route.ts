import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/services/supabase';
import { tryGeocodeWithFallback } from '@/lib/services/geocode.nominatim';

export async function POST(request: NextRequest) {
    try {
        const { userId } = await request.json();
        const supabase = getSupabase();

        if (!userId) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Missing userId' },
                { status: 400 }
            );
        }

        // Fetch current profile address
        const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('adresse, city, postal_code')
            .eq('id', userId)
            .single();

        if (fetchError || !profile) {
            throw new Error('Profile not found');
        }

        const addressParts = [
            (profile as Record<string, unknown>).adresse,
            (profile as Record<string, unknown>).postal_code,
            (profile as Record<string, unknown>).city
        ].filter(Boolean);
        const fullAddress = addressParts.join(', ');

        if (!fullAddress) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'User has no address to geocode' },
                { status: 400 }
            );
        }

        const geocodeResult = await tryGeocodeWithFallback(fullAddress);

        if (geocodeResult) {
            const { error: geoError } = await supabase
                .from('profiles')
                .update({
                    geocoded_lat: geocodeResult.lat,
                    geocoded_lng: geocodeResult.lng,
                    geocoded_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (geoError) {
                throw new Error(`Failed to save geocoding: ${geoError.message}`);
            }
            return NextResponse.json({ success: true, found: true });
        } else {
            return NextResponse.json({ success: true, found: false });
        }

    } catch (err: unknown) {
        console.error('[GEOCODE_RETRY_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
