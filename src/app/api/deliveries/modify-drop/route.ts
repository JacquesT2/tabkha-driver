import { NextResponse } from 'next/server';
import { saveModifiedDrop } from '@/lib/services/persistence.supabase';
import { fetchDeliveriesForDate } from '@/lib/services/deliveries.supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { order_id, original_delivery_date, new_delivery_date, new_delivery_window_start, new_delivery_window_end, notes } = body;

        if (!order_id || !original_delivery_date) {
            return NextResponse.json(
                { error: 'Missing required fields: order_id and original_delivery_date are required' },
                { status: 400 }
            );
        }

        // Prepare the payload for the Driver DB table
        const payload = {
            order_id,
            original_delivery_date,
            new_delivery_date: new_delivery_date || null,
            new_delivery_window_start: new_delivery_window_start || null,
            new_delivery_window_end: new_delivery_window_end || null,
            notes: notes || null,
            status: 'rescheduled'
        };

        // Save drop modification
        await saveModifiedDrop(payload);

        // Invalidate/refresh the delivery route if it exists? 
        // Usually routes are generated *after* modifications, but if there's already a saved route,
        // the system might need to re-run optimization. For now, we just save the modification.

        return NextResponse.json({
            success: true,
            message: 'Drop modification saved successfully to driver database'
        });

    } catch (error: any) {
        console.error('Error in modify-drop:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to modify drop' },
            { status: 500 }
        );
    }
}
