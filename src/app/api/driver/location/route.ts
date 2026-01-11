import { NextRequest, NextResponse } from 'next/server';
import { supabaseDriver } from '@/lib/services/supabase-driver';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { logs } = body;

        if (!Array.isArray(logs) || logs.length === 0) {
            return NextResponse.json({ success: true, count: 0 }); // Nothing to save
        }

        // Validate structure briefly
        if (!logs[0].latitude || !logs[0].longitude) {
            return NextResponse.json(
                { code: 'INPUT_INVALID', message: 'Invalid log format' },
                { status: 400 }
            );
        }

        // Insert into secondary DB
        const { error } = await supabaseDriver
            .from('driver_location_logs')
            .insert(logs);

        if (error) {
            // eslint-disable-next-line no-console
            console.error('[LOCATION_LOG] Insert failed:', error.message);
            return NextResponse.json(
                { code: 'DB_ERROR', message: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, count: logs.length });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[LOCATION_LOG] Unknown error:', err);
        return NextResponse.json(
            { code: 'INTERNAL', message: err.message },
            { status: 500 }
        );
    }
}
