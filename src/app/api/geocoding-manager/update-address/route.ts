import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/services/supabase';
import { tryGeocodeWithFallback } from '@/lib/services/geocode.nominatim';

export async function POST(request: NextRequest) {
    try {
        const { userId, street, city, postalCode } = await request.json();
        const supabase = getSupabase();

        if (!userId) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Missing userId' },
                { status: 400 }
            );
        }

        // Construct full address for geocoding
        const addressParts = [street, postalCode, city].filter(Boolean);
        const fullAddress = addressParts.join(', ');

        // 1. Update Profile in DB
        const updateData: Record<string, unknown> = {
            adresse: street || null,
            city: city || null,
            postal_code: postalCode || null,
            geocoded_at: null,
            geocoded_lat: null,
            geocoded_lng: null
        };

        const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', userId);

        if (updateError) {
            throw new Error(`Failed to update profile: ${updateError.message}`);
        }

        // 2. Attempt Geocoding immediately
        if (fullAddress) {
            const geocodeResult = await tryGeocodeWithFallback(fullAddress);

            if (geocodeResult) {
                await supabase
                    .from('profiles')
                    .update({
                        geocoded_lat: geocodeResult.lat,
                        geocoded_lng: geocodeResult.lng,
                        geocoded_at: new Date().toISOString()
                    })
                    .eq('id', userId);
            }
        }

        return NextResponse.json({ success: true });

    } catch (err: unknown) {
        console.error('[GEOCODE_MANAGER_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
