import { NextRequest, NextResponse } from 'next/server';
import { saveCustomRoute, listCustomRoutesForDate } from '@/lib/services/persistence.supabase';

// GET /api/deliveries/custom-routes/[date] - List custom routes for a date
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

        const routes = await listCustomRoutesForDate(date);
        return NextResponse.json({ routes });
    } catch (err: unknown) {
        console.error('[CUSTOM_ROUTES_LIST_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ code: 'INTERNAL', message }, { status: 500 });
    }
}

// POST /api/deliveries/custom-routes/[date] - Save a new custom route
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
        if (!body || !body.route || !body.depot || !body.name) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid request body. Required: name, route, depot' },
                { status: 400 }
            );
        }

        const id = await saveCustomRoute(date, body.name, body.description, body.route, body.depot);
        return NextResponse.json({ id, success: true });
    } catch (err: unknown) {
        console.error('[CUSTOM_ROUTES_SAVE_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ code: 'INTERNAL', message }, { status: 500 });
    }
}
