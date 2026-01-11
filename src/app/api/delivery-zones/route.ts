import { NextResponse } from 'next/server';
import { fetchActiveDeliveryZones } from '@/lib/services/delivery-zones.supabase';

export async function GET() {
    try {
        const zones = await fetchActiveDeliveryZones();
        return NextResponse.json({ zones });
    } catch (err: unknown) {
        console.error('[DELIVERY_ZONES_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
