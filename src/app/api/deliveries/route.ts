import { NextRequest, NextResponse } from 'next/server';
import { fetchDeliveriesForDate, getAllDeliveryDates } from '@/lib/services/deliveries.supabase';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const listDates = searchParams.get('list') === 'true';

        if (listDates) {
            const dates = await getAllDeliveryDates();
            return NextResponse.json({ dates });
        }

        if (!date) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Missing date parameter' },
                { status: 400 }
            );
        }

        const stops = await fetchDeliveriesForDate(date);
        return NextResponse.json({ stops });
    } catch (err: unknown) {
        console.error('[DELIVERIES_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
