import { NextResponse } from 'next/server';
import { getRouteStats } from '@/lib/services/directions.ors';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { points } = body;

        if (!points || !Array.isArray(points) || points.length < 2) {
            return NextResponse.json(
                { error: 'Invalid points. Need at least 2 coordinate pairs.' },
                { status: 400 }
            );
        }

        // points should be [[lng, lat], [lng, lat], ...]
        const stats = await getRouteStats(points);

        if (!stats) {
            return NextResponse.json(
                { error: 'Failed to calculate route.' },
                { status: 500 }
            );
        }

        return NextResponse.json(stats);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
