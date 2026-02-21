import { NextRequest, NextResponse } from 'next/server';
import { loadCustomRouteById } from '@/lib/services/persistence.supabase';

// GET /api/deliveries/custom-routes/[date]/[id] - Load a specific custom route
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ date: string; id: string }> }
) {
    try {
        const { id } = await params;
        if (!id) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Missing route id' },
                { status: 400 }
            );
        }

        const result = await loadCustomRouteById(id);
        if (!result) {
            return NextResponse.json(
                { code: 'NOT_FOUND', message: 'Custom route not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(result);
    } catch (err: unknown) {
        console.error('[CUSTOM_ROUTE_LOAD_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ code: 'INTERNAL', message }, { status: 500 });
    }
}
