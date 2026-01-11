import { NextResponse } from 'next/server';
import { fetchAllClients as getAllClients } from '@/lib/services/clients.supabase';

export async function GET() {
    try {
        const clients = await getAllClients();
        return NextResponse.json({ clients });
    } catch (err: unknown) {
        console.error('[CLIENTS_ERROR]', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
            { code: 'INTERNAL', message },
            { status: 500 }
        );
    }
}
