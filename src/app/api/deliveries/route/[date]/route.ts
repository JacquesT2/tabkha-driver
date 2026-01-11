import { NextRequest, NextResponse } from 'next/server';
import { saveRouteForDate, loadRouteForDate } from '@/lib/services/persistence.supabase';

// GET /api/deliveries/route/[date] - Load optimized route
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ date: string }> }
) {
    try {
        const { date } = await params;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid date format. Use YYYY-MM-DD' },
                { status: 400 }
            );
        }

        const result = await loadRouteForDate(date);
        if (!result) {
            return NextResponse.json(
                { code: 'NOT_FOUND', message: 'No route found for this date' },
                { status: 404 }
            );
        }

        return NextResponse.json(result);
    } catch (err: unknown) {
        console.error('[ROUTE_LOAD_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}

// POST /api/deliveries/route/[date] - Save optimized route
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ date: string }> }
) {
    try {
        const { date } = await params;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid date format. Use YYYY-MM-DD' },
                { status: 400 }
            );
        }

        const body = await request.json();
        if (!body || !body.route || !body.depot) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid request body' },
                { status: 400 }
            );
        }

        await saveRouteForDate(date, body.route, body.depot);
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        console.error('[ROUTE_SAVE_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
